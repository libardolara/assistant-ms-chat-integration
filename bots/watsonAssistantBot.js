// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const {
    ActivityHandler,
    CardFactory,
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
     * @param {string} text String to be sent as a message to Watson Assistant.
     * @param {string} sessionId Watson Assistant Session ID.
     * @param {string} userId ID from MS Teams or Bot Framework.
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
     * Sends a HeroCard with an Image
     * @param {context} context A TurnContext instance containing all the data needed for processing this conversation turn.
     * @param {string} title Card Title.
     * @param {string} text Text to the card.
     * * @param {string} src URL to the image to display.
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
     * @param {context} context A TurnContext instance containing all the data needed for processing this conversation turn.
     * @param {array} options The array object with the options from Watson Assistant.
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
        await this.userState.saveChanges(context, false);
    }
}

module.exports.WatsonAssistantBot = WatsonAssistantBot;
