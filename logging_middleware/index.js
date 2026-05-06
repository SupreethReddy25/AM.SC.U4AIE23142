const axios = require('axios');
require('dotenv').config();

const Log = async (stack, level, pkg, message) => {
    const safeMessage = String(message).substring(0, 48);
    const safePackage = String(pkg).substring(0, 48);

    const logData = {
        stack: stack.toLowerCase(),
        level: level.toLowerCase(),
        package: safePackage.toLowerCase(),
        message: safeMessage
    };

    try {
        const response = await axios.post(
            'http://20.207.122.201/evaluation-service/logs',
            logData,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`Log Created: ${response.data.logID}`);
        return response.data;
    } catch (error) {
        console.error('Logging Failed:', error.response ? error.response.data : error.message);
    }
};

module.exports = { Log };