const { WebClient } = require('@slack/web-api');
const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');

var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

// Initialize Slack client
const webclient = new WebClient(process.env.SLACK_TOKEN);

// Initialize firebase config
let serviceaccount = require("./bandfanphotourls-firebase-adminsdk-bxixw-1eaf1a138e.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceaccount),
    databaseURL: 'https://bandfanphotourls.firebaseio.com/'
});

// Get reference to firebase database
let db = admin.database();

// Handle async requests
(async () => {
    // Catch-all for standard get requests
    app.get('/', function(request, response) {
        response.end('ok');
    });

    app.get('/_ah/start', function(request, response) {
        response.end('Starting up...');
    });

    app.post('/gigs', function(request, response) {
        
        slackTest(request.body);
        webclient.chat.postMessage({
            text: "Hello",
            channel: request.body.channel_id
        });
        response.end();
    });

    app.listen(process.env.PORT, function () {
        console.log(`listening on ${process.env.PORT}`);
    });
})();

let slackTest = function(message) {
    return new Promise(function(resolve) {
        console.log(message);
        resolve();
    });
};
