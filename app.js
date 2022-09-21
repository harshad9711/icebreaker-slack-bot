const { App } = require("@slack/bolt");
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const he = require('he');
require("dotenv").config();
const schedule = require('node-schedule');
// Initializes your app with your bot token and signing secret
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true, // enable the following to use socket mode
    appToken: process.env.APP_TOKEN
});

let icebreakers = [];
let schedules = [];
let TRIVIA = "trivia";
let ICEBREAKER = "icebreaker";
let lastTrivia = ['', ''];

(async () => {
    // Load icebreakers into global array from JSON file
    fs.readFile("icebreakers.json", function (err, data) {
        const json = JSON.parse(data);
        icebreakers = json.questions; // loads icebreaker questions into array form json
    });

    // Starts app on port 3000
    const port = 3000;
    await app.start(process.env.PORT || port);
    console.log(`⚡️ Slack Bolt app is running on port ${port}!`);
})();

const sendIcebreaker = (say) => {
    const randIndex = Math.floor(Math.random() * icebreakers.length);
    const message = ":ice_cube::pick: *Break the ice!*\n\n" + icebreakers[randIndex];
    const messageObj = {
        text: 'Trivia Question',
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: message
                }
            }
        ]
    }

    say(messageObj);
}

app.command("/icebreaker", async ({ command, ack, say }) => {
    try {
        await ack();
        sendIcebreaker(say);
    } catch (error) {
        console.error(error);
    }
});

function triviaIcebreakerChecker(triviaIcebreaker) {
    if (triviaIcebreaker != TRIVIA && triviaIcebreaker != ICEBREAKER) return false;
    return true;
}

function timeChecker(hour, minute) {
    if (hour < 0 || hour > 23) {
        return false;
    }

    if (minute < 0 || minute > 59) {
        return false;
    }

    return true;
}

app.command("/schedule", async ({ command, ack, say }) => {
    try {
        await ack();
        let paramsArr = command.text.split(" ");
        if (paramsArr.length == 2) {
            let triviaIcebreaker = paramsArr[0].toLowerCase();
            let timeArr = paramsArr[1].split(":")
            let userHour = parseInt(timeArr[0]);
            let userMinute = parseInt(timeArr[1]);

            if (timeChecker(userHour, userMinute) && triviaIcebreakerChecker(triviaIcebreaker)) {
                app.client.chat.postEphemeral({
                    channel: command.channel_id,
                    text: 'Scheduling a ' + triviaIcebreaker + ' for ' + userHour + ":" + userMinute + '.',
                    user: command.user_id
                });
                const j = schedule.scheduleJob({ hour: userHour, minute: userMinute }, () => {
                    if (triviaIcebreaker == TRIVIA) {
                        sendTrivia(say);
                    } else {
                        sendIcebreaker(say);
                    }
                });
            } else {
                app.client.chat.postEphemeral({
                    channel: command.channel_id,
                    text: '_Please use the format_ /schedule [icebreaker | trivia] [time (ex. 14:30)]',
                    user: command.user_id
                });
            }
        } else {
            app.client.chat.postEphemeral({
                channel: command.channel_id,
                text: '_Please use the format_ /schedule [icebreaker | trivia] [time (ex. 14:30)]',
                user: command.user_id
            });
        }


    } catch (error) {
        console.error(error);
    }
});

function shuffleArr(array) {
    let currentIndex = array.length, randomIndex;

    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
}

const sendTrivia = (say) => {
    fetch('https://opentdb.com/api.php?amount=1&category=9&difficulty=easy&type=multiple')
        .then((response) => response.json())
        .then((data) => {
            let question = data.results[0].question;
            let answers = data.results[0].incorrect_answers;
            answers.push(data.results[0].correct_answer);
            shuffleArr(answers);

            lastTrivia = [he.decode(question), he.decode(data.results[0].correct_answer)];

            const message = ':question: *' + he.decode(question) + '*\n\n' + '\t\tA) ' + he.decode(answers[0]) + '\n\t\tB) ' + he.decode(answers[1]) + '\n\t\tC) ' + he.decode(answers[2]) + '\n\t\tD) ' + he.decode(answers[3]);
            const answerMessage = "_Post your guesses in this thread! Then, get the answer to this question by using */trivia answer*._";

            const messageObj = {
                text: 'Trivia Question',
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: message
                        }
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: answerMessage
                        }
                    }
                ]
            }

            say(messageObj);
        })
        .catch((err) => console.error(err));
}

app.command("/trivia", async ({ command, ack, say }) => {
    try {
        await ack();

        if (command.text === 'answer') {
            const message = "Your last trivia question was: '" + lastTrivia[0] + "'\n\nAnd the answer is... *" + lastTrivia[1] + "*!";
            const messageObj = {
                text: 'Trivia Answer',
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: message
                        }
                    }
                ]
            }

            say(messageObj);
        } else {
            sendTrivia(say);
        }
    } catch (error) {
        console.error(error);
    }
});

app.event('member_joined_channel', async ({ event, client, logger }) => {
    try {
        console.log(event);
        const result = await client.chat.postMessage({
            channel: event.channel,
            text: `Welcome <@${event.user}>! Help your team get to know you better.\nPlease give the following: preferred name, pronouns, and a fun fact about yourself.\n\n_Type '/help' for all available bot features._`
        });
        logger.info(result);
    }
    catch (error) {
        logger.error(error);
    }
});

app.command("/help", async ({ command, ack, say }) => {
    try {
        await ack();

        const helpMessage = '*Here are a list of my commands and their functions:*\n\n/icebreaker: _Sends an icebreaker question_\n/trivia: _Sends a trivia question_\n/trivia answer: _Sends the answer to the most recent trivia question_\n/schedule [icebreaker | trivia] [time (ex. 14:30)]: _Schedules an icebreaker or trivia question to be sent at a certain time each day_';

        app.client.chat.postEphemeral({
            channel: command.channel_id,
            text: helpMessage,
            user: command.user_id
        });
    } catch (error) {
        console.error(error);
    }
});