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
            let userInfo = await getUserInfo(request.body.user_id);
            await sendUserGigs(userInfo.user.id, userInfo.user.real_name, request.body.channel_id);
            response.end();
        } else if (request.body.text === "view") {
            if (await userGigAuthed(request.body.user_id)) {
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
                response.end();
            } else {
                response.end("You are not authorized to view other users' gigs.  If you are trying to view your own gigs, " +
                    "simply type */gigs*");
            }
        } else if (request.body.text === "all") {
            if (await userGigAuthed(request.body.user_id)) {
                response.end("Fetching all gigs...");
                await sendAllUserGigs(request.body.channel_id);
            } else {
                response.end("You are not authorized to view all gigs.  If you are trying to view your own gigs, " +
                    "simply type */gigs*");
            }
        } else if (request.body.text === "reset") {
            if (await userGigAuthed(request.body.user_id)) {
                webclient.chat.postMessage({
                    "blocks": [
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": "Which user's gigs would you like to *reset*?"
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
                response.end();
            } else {
                response.end("You are not authorized to reset any gigs");
            }
        } else if (request.body.text === "add") {
            if (await userGigAuthed(request.body.user_id)) {
                webclient.chat.postMessage({
                    "blocks": [
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": "Which user would you like to gig?"
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
                response.end();
            } else {
                response.end("You are not authorized to add any gigs");
            }
        } else {
            response.end("Invalid command!");
        }
    });

    app.post('/interactive', async function(request, response) {
        let jsonreq = JSON.parse(request.body.payload);
        if (jsonreq.actions[0].type === "users_select") {
            let selectedUser = jsonreq.actions[0].selected_user;
            let userInfo = await getUserInfo(selectedUser);
            if (jsonreq.message.blocks[0].text.text === "Which user's gigs would you like to view?") {
                if (await userGigAuthed(jsonreq.user.id)) {
                    sendUserGigs(selectedUser, userInfo.user.real_name, jsonreq.channel.id);
                } else {
                    response.end("You are not authorized to view other users' gigs.  If you are trying to view your own gigs, " +
                        "simply type */gigs*");
                }
            } else if (jsonreq.message.blocks[0].text.text === "Which user's gigs would you like to *reset*?") {
                confirmUserReset(userInfo.user.real_name, selectedUser, jsonreq.channel.id);
            } else if (jsonreq.message.blocks[0].text.text === "Which user would you like to gig?") {
                confirmAddUserGig(userInfo.user.real_name, selectedUser, jsonreq.channel.id);
            }
        } else if (jsonreq.actions[0].type === "button") {
            let button_val = jsonreq.actions[0].value;
            if (button_val.substring(0, 10) === "cancel_gig") {
                let deleteMessageRequest = {
                    channel: jsonreq.channel.id,
                    ts: jsonreq.message.ts
                };
                webclient.chat.delete(deleteMessageRequest);
            } else if (button_val.substring(0, 11) === "confirm_gig") {
                if (await userGigAuthed(jsonreq.user.id)) {
                    let gigUser = button_val.substring(12);
                    addUserGig(gigUser).then(async function() {
                        await webclient.chat.postMessage({
                            text: "User gig has been logged",
                            channel: jsonreq.channel.id
                        });
                    });
                } else {
                    response.end("You are not authorized to gig users.");
                }
            } else if (button_val.substring(0, 12) === "cancel_reset") {
                let deleteMessageRequest = {
                    channel: jsonreq.channel.id,
                    ts: jsonreq.message.ts
                };
                webclient.chat.delete(deleteMessageRequest);
            } else if (button_val.substring(0, 13) === "confirm_reset")  {
                if (await userGigAuthed(jsonreq.user.id)) {
                    let resetUser = button_val.substring(14);
                    backupUserGigs(resetUser).then(function() {
                        resetUserGigs(resetUser).then(async function() {
                            await webclient.chat.postMessage({
                                text: "User gigs successfully reset",
                                channel: jsonreq.channel.id
                            });
                        });
                    });
                } else {
                    response.end("You are not authorized to reset user gigs.");
                }
            }
        }
        response.end();
    });

    app.listen(process.env.PORT, function () {
        console.log(`listening on ${process.env.PORT}`);
    });
})();

let addUserGig = function(userid) {
    return new Promise(async function(resolve) {
        ref.child("gigs").child(userid).child("gigs").set(
            await getUserGigs((userid)) + 1
        ).then(resolve());
    });
}

let confirmAddUserGig = function(name, userid, channel) {
    return new Promise(async function(resolve) {
        await webclient.chat.postMessage({
            blocks: [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "Are you sure you want to give *" + name + "* a gig?"
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "style": "primary",
                            "text": {
                                "type": "plain_text",
                                "text": "Gig",
                                "emoji": true
                            },
                            "value": "confirm_gig_" + userid
                        },
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Cancel",
                                "emoji": true
                            },
                            "value": "cancel_gig"
                        }
                    ]
                }],
            channel: channel
        });
        resolve();
    });
}

let resetUserGigs = function(userid) {
    return new Promise(function(resolve) {
        ref.child("gigs").child(userid).child("gigs").set(0).then(resolve());
    })
}

let confirmUserReset = function(name, userid, channel) {
    return new Promise(async function(resolve) {
        await webclient.chat.postMessage({
            blocks: [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "Are you sure you want to reset *" + name + "*'s gigs?"
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "style": "primary",
                            "text": {
                                "type": "plain_text",
                                "text": "Reset",
                                "emoji": true
                            },
                            "value": "confirm_reset_" + userid
                        },
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Cancel",
                                "emoji": true
                            },
                            "value": "cancel_reset"
                        }
                    ]
                }],
            channel: channel
        });
        resolve();
    });
};

let getAllUserGigs = function() {
    return new Promise(function(resolve) {
        var allChange = ref.child("gigs").on("value", async function(snapshot) {
            let userGigsObj = snapshot.val();
            let userGigs = Object.keys(userGigsObj).map((key) => userGigsObj[key]);
            userGigs.sort(nameCompare);
            resolve(userGigs);
        });
        ref.off("value", allChange);
    });
};

let sendAllUserGigs = function(channel) {
    return new Promise(async function(resolve) {
        let userGigs = await getAllUserGigs();
        let blocks = [];
        for (let user in userGigs) {
            blocks.push({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "_" + userGigs[user].name + "_: *" + userGigs[user].gigs.toString() + "* gigs"
                }
            });
        }
        await webclient.chat.postMessage({
            blocks: blocks,
            channel: channel
        });
        resolve();
    });
};

let nameCompare = function(a, b) {
    if (a.name < b.name) {
        return -1;
    }
    if (a.name > b.name) {
        return 1;
    }
    return 0;
};

let getUserInfo = function(userid) {
    return new Promise(async function(resolve) {
        let info = await webclient.users.info({
            user: userid
        });
        resolve(info);
    });
};

let userGigAuthed = function(userid) {
    return new Promise(function(resolve) {
        var reffunc = ref.child("gig_users").on("value", async function(snapshot) {
            let authed_users = snapshot.val();
            authed_users = authed_users.split(",");
            let authed = false;
            for (let i = 0; i < authed_users.length; i++) {
                if (authed_users[i] === userid) {
                    authed = true;
                }
            }
            if (authed) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        ref.off("value", reffunc);
    });
};

let sendUserGigs = function(userid, username, channelid) {
    return new Promise(async function(resolve) {
        let user_gigs = await getUserGigs(userid);
        await webclient.chat.postMessage({
            text: "_" + username + "_: You currently have *" + user_gigs.toString() + "* gigs",
            channel: channelid
        });
        resolve();
    });
};

let getUserGigs = function(userid) {
    return new Promise(function(resolve){
        var reffunc = ref.child("gigs").child(userid).on("value", function(snapshot) {
            resolve(snapshot.val().gigs);
        });
        ref.off("value", reffunc);
    });
};

let getDateTimeStamp = function() {
    let timestampdate = new Date(Date.now());
    let timestamp = timestampdate.toDateString() + " " + timestampdate.toLocaleTimeString('en-US');
    return timestamp;
}

let backupUserGigs = function(userid) {
    return new Promise(function(resolve, reject) {
        var reffunc = ref.child("gigs").child(userid).on("value", function(snapshot) {
            let gigs = snapshot.val();
            let timestamp = getDateTimeStamp();
            let backup = {};
            backup[userid] = gigs;
            ref.child("backup_gigs").child(timestamp).set(backup).then(
                resolve(userid + " gigs backed up")
            ).catch(
                reject(userid + " gigs NOT backed up!")
            );
        });
        ref.off("value", reffunc);
    });
};

let backupGigs = function() {
    return new Promise(function(resolve, reject) {
        var reffunc = ref.child("gigs").on("value", function(snapshot) {
            let gigs = snapshot.val();
            let timestamp = getDateTimeStamp();
            ref.child("backup_gigs").child(timestamp).set(gigs).then(
                resolve("Gigs backed up")
            ).catch(
                reject("Gig back up FAILED")
            );
        });
        ref.off("value", reffunc);
    });
};

let resetAllGigs = function() {
    return new Promise(async function(resolve, reject) {
        // First, backup gigs
        backupGigs().then(async function() {
            let users = await webclient.users.list({
                token: process.env.SLACK_TOKEN
            });
            users = users.members;

            let resetGigs = {}
            for (let i = 0; i < users.length; i++) {
                if (users[i].id !== "USLACKBOT" && users[i].id !== "U017P4RFT60" && users[i].id !== "U0189C4PW2C"
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