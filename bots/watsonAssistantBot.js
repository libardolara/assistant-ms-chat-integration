// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const {
    ActivityHandler,
    CardFactory,
    TurnContext,
    MessageFactory
} = require('botbuilder');
const { ActionTypes } = require('botframework-schema');

const USER_PROFILE_PROPERTY = 'userProfile';

class WatsonAssistantBot extends ActivityHandler {
    constructor(userState, assistantBot, ASSISTANT_ID, myStorage) {
        super();

        this.storage = myStorage;

        this.userProfileAccessor = userState.createProperty(USER_PROFILE_PROPERTY);
        this.userState = userState;

        this._assistant = assistantBot;
        this._ASSISTANT_ID = ASSISTANT_ID;

        this.onConversationUpdate(async (context, next) => {
            await this.addConversationReference(context.activity);

            await next();
        });

        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            for (let cnt = 0; cnt < membersAdded.length; cnt++) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    await this.addConversationReference(context.activity);
                    //const welcomeMessage = 'Welcome to the Proactive Bot sample';
                    //await context.sendActivity(welcomeMessage);
                }
            }

            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

        this.onMessage(async (context, next) => {
            // Get the state properties from the context.
            const userProfile = await this.userProfileAccessor.get(context, {});
            if (!userProfile.wa_session_id) {
                var sessionData = await this._assistant.createSession({
                    assistantId: this._ASSISTANT_ID
                });
                userProfile.wa_session_id = sessionData.result.session_id
            }
            // Invoke Watson Assistant 
            var res;
            try {
                res = await this.invokeWatsonAssistant(context.activity.text, userProfile.wa_session_id, context.activity.from.id)
            } catch (error) {
                if (error == 'Invalid Session') {
                    var sessionData = await this._assistant.createSession({
                        assistantId: this._ASSISTANT_ID
                    });
                    userProfile.wa_session_id = sessionData.result.session_id
                    res = await this.invokeWatsonAssistant(context.activity.text, userProfile.wa_session_id, context.activity.from.id)
                } else {
                    res = { result: { output: { generic: [{ response_type: "text", text: `Error ${error}` }] } } };
                }
            }
            // Send the responses with the correct format
            console.log("Response:\n" + JSON.stringify(res.result, null, 2));
            for (const line of res.result.output.generic) {
                if (line.response_type == "text") {
                    //console.log('Sending: ' + line.text);
                    await context.sendActivity(line.text);
                } else if (line.response_type == "option") {
                    await this.sendSuggestedActions(context, line.options);
                } else if (line.response_type == "iframe") {
                    await this.sendHeroCard(context, line.title, line.description, line.source);
                } else {
                    //TODO: Implement other types;
                    //const replyActivity = MessageFactory.text(line.text);
                }
            }

            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });
    }

    /**
     * Send users message to Watson Assistant.
     * @param {text} text TODO.
     * @param {sessionId} sessionId TODO.
     * @param {userId} userId TODO.
     */
    async invokeWatsonAssistant(text, sessionId, userId) {
        var res = await this._assistant.message({
            assistantId: this._ASSISTANT_ID,
            sessionId: sessionId,
            userId: userId,
            input: {
                'message_type': 'text',
                'text': text
            }
        });
        return res;
    }

    /**
     * Adds a member conversation reference.
     * @param {activity} activity TODO.
     */
    async addConversationReference(activity) {
        const conversationReference = TurnContext.getConversationReference(activity);
        await this.getConversationReferences();
        this.conversationReferences["ConversationReferences"].CRList[conversationReference.user.id] = conversationReference;
        await this.storage.write(this.conversationReferences);
    }

    /**
     * Return the Conversation References
     */
    async getConversationReferences() {
        // Dependency injected dictionary for storing ConversationReference objects used in NotifyController to proactively message users
        if (this.conversationReferences === undefined) {
            let conversationReferences = await this.storage.read(["ConversationReferences"]);

            if (typeof (conversationReferences["ConversationReferences"]) === 'undefined') {
                conversationReferences["ConversationReferences"] = { CRList: {}, "eTag": "*" };
            }
            this.conversationReferences = conversationReferences;
        }

        return this.conversationReferences;
    }


    /**
     * Sends a HeroCard.
     * @param {text} text TODO.
     * @param {context} context TODO.
     * @param {title} userId TODO.
     * * @param {src} src TODO.
     */
    async sendHeroCard(context, title, text, src) {
        const buttons = [
            { type: ActionTypes.OpenUrl, title: 'Open Website', value: src }
        ];
        var heroCard = CardFactory.heroCard(title, [src], buttons, { text: text });

        const message = MessageFactory.attachment(heroCard);
        await context.sendActivity(message);
    }

    /**
     * Send suggested actions to the user.
     * @param {context} context A context instance containing all the data needed for processing this conversation turn.
     */
    async sendSuggestedActions(context, options) {
        var cardActions = []
        for (const opt of options) {
            var optObject = {
                type: ActionTypes.ImBack,
                title: opt.label,
                value: opt.value.input.text
            };
            cardActions.push(optObject)
        }

        var reply = MessageFactory.suggestedActions(cardActions);
        await context.sendActivity(reply);
    }

    /**
     * Override the ActivityHandler.run() method to save state changes after the bot logic completes.
     */
    async run(context) {
        await super.run(context);

        // Save any state changes. The load happened during the execution of the Dialog.
        //await this.conversationState.saveChanges(context, false);
        await this.userState.saveChanges(context, false);
        //await this.storage.write(this.conversationReferences);
    }
}

module.exports.WatsonAssistantBot = WatsonAssistantBot;
