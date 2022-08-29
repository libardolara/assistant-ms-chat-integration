// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// index.js is used to setup and configure your bot

// Import required pckages
const path = require('path');

// Read botFilePath and botFileSecret from .env file.
const ENV_FILE = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_FILE });

const restify = require('restify');

// Importing requiered Watson Assistant
const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
const {
  CloudAdapter,
  UserState,
  ConfigurationBotFrameworkAuthentication
} = require('botbuilder');

const { CosmosDbPartitionedStorage } = require('botbuilder-azure');

const myStorage = new CosmosDbPartitionedStorage({
  cosmosDbEndpoint: process.env.CosmosDbEndpoint,
  authKey: process.env.CosmosDbAuthKey,
  databaseId: process.env.CosmosDbDatabaseId,
  containerId: process.env.CosmosDbContainerId,
  compatibilityMode: false
});

const { WatsonAssistantBot } = require('./bots/watsonAssistantBot');

const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(process.env);

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about how bots work.
const adapter = new CloudAdapter(botFrameworkAuthentication);

adapter.onTurnError = async (context, error) => {
  // This check writes out errors to console log .vs. app insights.
  // NOTE: In production environment, you should consider logging this to Azure
  //       application insights. See https://aka.ms/bottelemetry for telemetry
  //       configuration instructions.
  console.error(`\n [onTurnError] unhandled error: ${error}`);

  // Send a trace activity, which will be displayed in Bot Framework Emulator
  await context.sendTraceActivity(
    'OnTurnError Trace',
    `${error}`,
    'https://www.botframework.com/schemas/error',
    'TurnError'
  );

  // Send a message to the user
  await context.sendActivity('The bot encountered an error or bug.');
  await context.sendActivity('To continue to run this bot, please fix the bot source code.');
};

// Create the service wrapper
var assis_url = process.env.ASSISTANT_URL || 'https://gateway.watsonplatform.net/assistant/api/';

const assistant = new AssistantV2({
  authenticator: new IamAuthenticator({
    apikey: process.env.ASSISTANT_APIKEY,
  }),
  serviceUrl: assis_url,
  version: "2021-11-27",
});

// Create user state with CosmosDB storage provider.
const userState = new UserState(myStorage);

// Create the bot that will handle incoming messages.
const bot = new WatsonAssistantBot(userState, assistant, process.env.ASSISTANT_ID, myStorage);

// Create HTTP server.
const server = restify.createServer();
server.use(restify.plugins.queryParser({
  mapParams: true
}));
server.use(restify.plugins.bodyParser({
  mapParams: true
}));

server.listen(process.env.port || process.env.PORT || 3978, function () {
  console.log(`\n${server.name} listening to ${server.url}`);
});

// Listen for incoming notifications and send Notification messages to users.
server.get('/api/notify', async (req, res) => {
  try {
    console.log("req", req.params);
    const userID = req.params.userID;
    const conversationReferences = await bot.getConversationReferences();
    if (userID !== undefined) {
      const cr_user = conversationReferences["ConversationReferences"].CRList[userID];
      await adapter.continueConversationAsync(process.env.MicrosoftAppId, cr_user, async context => {
        await context.sendActivity('Notification hello');
      });
    } else {
      throw new Error("No user defined");
    }
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.write('<html><body><h1>Notification messages have been sent.</h1></body></html>');
    res.end();
  } catch (error) {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(400);
    res.write(`<html><body><h1>${error}</h1></body></html>`);
    res.end();
  }
});

server.get('/api/notifyAll', async (req, res) => {
  try {
    const conversationReferences = await bot.getConversationReferences();
    for (const conversationReference of Object.values(conversationReferences["ConversationReferences"].CRList)) {
      adapter.continueConversationAsync(process.env.MicrosoftAppId, conversationReference, async context => {
        await context.sendActivity('Notification hello');
      });
    }
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.write('<html><body><h1>Notification messages have been sent.</h1></body></html>');
    res.end();
  } catch (error) {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(400);
    res.write(`<html><body><h1>${error}</h1></body></html>`);
    res.end();
  }


});

// Listen for incoming requests.
server.post('/api/messages', async (req, res) => {
  // Route received a request to adapter for processing
  await adapter.process(req, res, (context) => bot.run(context));
});
