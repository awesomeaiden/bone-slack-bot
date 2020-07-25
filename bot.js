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
let ref = db.ref("slack");

// Handle async requests
(async () => {
    // Catch-all for standard get requests
    app.get('/', function(request, response) {
        response.end('ok');
    });

    app.get('/_ah/start', function(request, response) {
        response.end('Starting up...');
    });

    app.post('/gigs', async function(request, response) {
        if (request.body.text === "") {
            user_gigs = await getUserGigs(request.body.user_id);
            webclient.chat.postMessage({
                text: "_" + request.body.user_name + "_: You currently have *" + user_gigs.toString() + "* gigs",
                channel: request.body.channel_id
            });
        } else if (request.body.text === "view") {
            if (userGigAuthed(requst.body.user_id)) {
                webclient.chat.postMessage({
                    "blocks": [
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": "Which user's gigs would you like to view?"
                            },
                            "accessory": {
                                "type": "users_select",
                                "placeholder": {
                                    "type": "plain_text",
                                    "text": "Select a user",
                                    "emoji": true
                                }
                            }
                        }
                    ],
                    channel: request.body.channel_id
                });
            } else {
                webclient.chat.postMessage({
                    text: "You are not authorized to view other users' gigs.  If you are trying to view your own gigs, " +
                        "simply type */gigs*",
                    channel: request.body.channel_id
                });
            }
        } else if (request.body.text === "all") {
            if (userGigAuthed(requst.body.user_id)) {
                // send message with summary of all gigs
            } else {
                webclient.chat.postMessage({
                    text: "You are not authorized to view all gigs.  If you are trying to view your own gigs, " +
                        "simply type */gigs*",
                    channel: request.body.channel_id
                });
            }
        } else {
            webclient.chat.postMessage({
                text: "Invalid command",
                channel: request.body.channel_id
            });
        }
        response.end();
    });

    app.listen(process.env.PORT, function () {
        console.log(`listening on ${process.env.PORT}`);
    });
})();

let userGigAuthed = function(userid) {
    return new Promise(function(resolve) {
        ref.child("gigs").child("gig_users").on("value", function(snapshot) {
            let authed_users = snapshot.val();
            if (authed_users.includes(userid)) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
};

let getUserGigs = function(userid) {
    return new Promise(function(resolve){
        ref.child("gigs").child(userid).on("value", function(snapshot) {
            resolve(snapshot.val().gigs);
        });
    });
}

let backupGigs = function() {
    return new Promise(function(resolve, reject) {
        ref.child("gigs").on("value", function(snapshot) {
            let gigs = snapshot.val();
            let timestampdate = new Date(Date.now());
            let timestamp = timestampdate.toDateString() + " " + timestampdate.getTime();
            ref.child("backup_gigs").child(timestamp).set(gigs).then(
                resolve("Gigs backed up")
            ).catch(
                reject("Gig back up FAILED")
            );
        });
    });
};

let resetAllGigs = function() {
    return new Promise(function(resolve, reject) {
        // First, backup gigs
        backupGigs().then(async function() {
            let users = await webclient.users.list({
                token: process.env.SLACK_TOKEN
            });
            users = users.members;

            let resetGigs = {}
            for (let i = 0; i < users.length; i++) {
                if (users[i].id !== "USLACKBOT" && users[i].id !== "U017P4RFT60" && users[i].id !== "U017FHBTK7X"
                    && users[i].id !== "U017P462Z60") {
                    resetGigs[users[i].id] = {
                        "name": users[i].real_name,
                        "gigs": 0
                    };
                }
            }

            await ref.child("gigs").set(resetGigs).then(
                resolve("All gigs reset")
            ).catch(reject("Could not reset gigs"));
        });
    });
};