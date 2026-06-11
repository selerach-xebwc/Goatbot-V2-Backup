module.exports = {
        config: {
                name: "antiout",
                version: "1.0",
                author: "Neoaz",
                countDown: 5,
                role: 2,
                description: {
                        en: "Toggle anti-out: automatically re-adds any member who leaves the group"
                },
                category: "box chat",
                guide: {
                        en: "   {pn} on  — enable anti-out for this group"
                                + "\n   {pn} off — disable anti-out for this group"
                }
        },

        langs: {
                en: {
                        turnedOn: "✅ Anti-out is now ON.\nAnyone who leaves this group will be automatically added back.",
                        turnedOff: "❌ Anti-out is now OFF.\nMembers can leave the group freely.",
                        alreadyOn: "⚠️ Anti-out is already ON for this group.",
                        alreadyOff: "⚠️ Anti-out is already OFF for this group.",
                        syntaxError: "Usage: antiout on | off",
                        addedBack: "🔒 Anti-out is active!\n{userName} was added back to the group automatically.",
                        addFailed: "⚠️ Anti-out: Failed to add back {userName}."
                }
        },

        onStart: async function ({ message, event, args, threadsData, api, getLang }) {
                const { threadID } = event;
                const toggle = (args[0] || "").toLowerCase();

                if (!["on", "off"].includes(toggle))
                        return message.reply(getLang("syntaxError"));

                const current = await threadsData.get(threadID, "data.antiOut", false);

                if (toggle === "on") {
                        if (current === true)
                                return message.reply(getLang("alreadyOn"));
                        await threadsData.set(threadID, true, "data.antiOut");
                        return message.reply(getLang("turnedOn"));
                }
                else {
                        if (!current)
                                return message.reply(getLang("alreadyOff"));
                        await threadsData.set(threadID, false, "data.antiOut");
                        return message.reply(getLang("turnedOff"));
                }
        },

        onEvent: async function ({ api, event, threadsData, usersData, message, getLang }) {
                if (event.logMessageType !== "log:unsubscribe")
                        return;

                const { threadID, logMessageData } = event;
                const leftUserID = logMessageData.leftParticipantFbId;

                if (!leftUserID)
                        return;

                const botID = api.getCurrentUserID();

                if (leftUserID === botID)
                        return;

                const antiOut = await threadsData.get(threadID, "data.antiOut", false);
                if (!antiOut)
                        return;

                return async function () {
                        try {
                                const userName = await usersData.getName(leftUserID);
                                await api.addUserToGroup(leftUserID, threadID);
                                message.send(
                                        getLang("addedBack").replace("{userName}", userName)
                                );
                        }
                        catch (err) {
                                try {
                                        const userName = await usersData.getName(leftUserID);
                                        message.send(
                                                getLang("addFailed").replace("{userName}", userName)
                                        );
                                }
                                catch (_) {}
                        }
                };
        }
};
