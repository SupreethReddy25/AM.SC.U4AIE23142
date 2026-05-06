const axios = require('axios');
const { Log } = require('../logging_middleware/index');
require('dotenv').config();

const BASE_URL = 'http://20.207.122.201/evaluation-service/notifications';
const HEADERS = { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` };

const WEIGHTS = {
    "Placement": 3,
    "Result": 2,
    "Event": 1
};

const fetchNotifications = async () => {
    try {
        await Log("backend", "info", "service", "Fetching notifications for Stage 6");
        const res = await axios.get(BASE_URL, { headers: HEADERS });
        return res.data.notifications;
    } catch (err) {
        await Log("backend", "error", "service", "Failed to fetch notifications");
        return [];
    }
};

const processPriorityInbox = async (n) => {
    await Log("backend", "info", "controller", `Processing top ${n} priority notifications`);

    const notifications = await fetchNotifications();

    if (!notifications || notifications.length === 0) {
        console.log("No notifications found.");
        return;
    }

    notifications.sort((a, b) => {
        const weightA = WEIGHTS[a.Type] || 0;
        const weightB = WEIGHTS[b.Type] || 0;

        if (weightA !== weightB) {
            return weightB - weightA;
        }

        return new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime();
    });

    const topNotifications = notifications.slice(0, n);

    console.log(JSON.stringify(topNotifications, null, 2));

    await Log("backend", "info", "controller", "Priority inbox generated successfully");
};

processPriorityInbox(10);