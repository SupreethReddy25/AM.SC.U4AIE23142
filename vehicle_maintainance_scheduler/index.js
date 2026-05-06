const axios = require('axios');
const { Log } = require('../logging_middleware/index');
require('dotenv').config();

const BASE_URL = 'http://20.207.122.201/evaluation-service';
const HEADERS = { 'Authorization': `Bearer ${process.env.ACCESS_TOKEN}` };

const getDepots = async () => {
    try {
        const res = await axios.get(`${BASE_URL}/depots`, { headers: HEADERS });
        await Log("backend", "info", "service", `Depots found: ${res.data.depots.length}`);
        return res.data.depots;
    } catch (err) {
        await Log("backend", "error", "service", "Depot fetch failed");
        return [];
    }
};

const getVehicles = async () => {
    try {
        const res = await axios.get(`${BASE_URL}/vehicles`, { headers: HEADERS });
        await Log("backend", "info", "service", `Vehicles found: ${res.data.vehicles.length}`);
        return res.data.vehicles;
    } catch (err) {
        await Log("backend", "error", "service", "Vehicle fetch failed");
        return [];
    }
};

const solveOptimization = (capacity, items) => {
    const n = items.length;
    const dp = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(0));
    for (let i = 1; i <= n; i++) {
        const { Duration, Impact } = items[i - 1];
        for (let w = 0; w <= capacity; w++) {
            if (Duration <= w) dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - Duration] + Impact);
            else dp[i][w] = dp[i - 1][w];
        }
    }
    let result = [], res = dp[n][capacity], w = capacity;
    for (let i = n; i > 0 && res > 0; i--) {
        if (res !== dp[i - 1][w]) {
            result.push(items[i - 1]);
            res -= items[i - 1].Impact;
            w -= items[i - 1].Duration;
        }
    }
    return result;
};

const runScheduler = async () => {
    await Log("backend", "info", "controller", "Starting Scheduler");
    const [depots, vehicles] = await Promise.all([getDepots(), getVehicles()]);

    const results = depots.map(d => {
        const selected = solveOptimization(d.MechanicHours, vehicles);
        return {
            depotId: d.ID,
            maxHours: d.MechanicHours,
            usedHours: selected.reduce((s, v) => s + v.Duration, 0),
            totalImpact: selected.reduce((s, v) => s + v.Impact, 0),
            vehicles: selected.map(v => v.TaskID) // Fixed: Exact match for API response
        };
    });

    console.log(JSON.stringify(results, null, 2));
    await Log("backend", "info", "controller", "Scheduler finished successfully");
};

runScheduler();