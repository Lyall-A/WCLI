const prompts = require("prompts");
const http = require("http");
const info = { };
const { writeFileSync, readFileSync } = require("fs");
let lastInstance;
try {
    lastInstance = readFileSync("./lastinstance", "utf-8");
} catch (err) { }

(async function main() {
    // Prompt user for WLED instance IP
    info.instance = await prompts({
        name: "instance",
        type: "text",
        message: "Enter IP of WLED instance",
        initial: lastInstance,
        validate: i => i ? true : "You must enter the IP of your WLED instance"
    }).then(i => i.instance || process.exit(0));
    
    // Check if IP is valid
    if (!verifyIp(info.instance)) {
        console.log("IP is not valid!");
        return main();
    }

    // Prompt user if WLED info should contain advanced info
    info.advanced = await prompts({
        name: "advanced",
        type: "select",
        message: "Show advanced options",
        choices: [{ title: "Yes", value: true }, { title: "No", value: false }]
    }).then(i => i.advanced);

    // Get data from WLED instance
    await updateInfo().catch(err => {
        console.log(`Could not fetch, make sure the IP is valid and try again!\n`, err);
        return main();
    });

    // Add IP to file for easy access later
    if (lastInstance != info.instance) {
        try {
            writeFileSync("./lastinstance", info.instance);
        } catch (err) { }
    }
    
    // Update info every 5 seconds
    setInterval(() => updateInfo().catch(() => { }), 5 * 1000);

    // Log info
    console.log("       [INFO]");
    console.log(`Status:        ${info.state.on ? "ON" : "OFF"}`);
    console.log(`Preset:        ${(info.state.ps < 0) ? "None" : info.state.ps}`);
    console.log(`Playlist:      ${(info.state.pl < 0) ? "None" : info.state.pl}`);
    console.log(`Brightness:    ${Math.round(info.state.bri / 2.55)}% (${info.state.bri})`);
    console.log(`Name:          ${info.info.name}`);
    console.log(`LED count:     ${info.info.leds.count}`);
    if (info.advanced) {
    // Log advanced info
    console.log("   [ADVANCED INFO]");
    console.log(`WLED Version:  ${info.info.ver}`);
    console.log(`Uptime:        ${Math.floor(info.info.uptime / 86400)} days`);
    console.log(`Architecture:  ${info.info.arch.toUpperCase()}`);
    console.log(`Free heap:     ${info.info.freeheap / 1000} KB`);
    console.log(`MAC:           ${info.info.mac.toUpperCase()}`);
    }
    
    (async function menu() {
        // Prompt user for command
        const { menuPrompt } = await prompts({
            name: "menuPrompt",
            type: "select",
            message: "What do you want to do?",
            choices: [
                { title: `Turn ${info.state.on ? "off" : "on"}`, value: 1 },
                { title: "Change brightness", value: 2 },
                { title: "Set preset", value: 3 },
                { title: "View info", value: 4 }
            ]
        });
        if (!menuPrompt) return main(); // Return to start if no answer

        switch (menuPrompt) {
            case 1:
                // Turn instance on/off
                const state = info.state.on;
                await req("/state", { on: state ? false : true }).then(() => {
                    info.state.on = state ? false : true;
                    console.log(`LED's are now ${info.state.on ? "on" : "off"}!`);
                }).catch(() => `Failed to turn ${info.state.on ? "off" : "on"} LED's`);
                menu();
                break;
            case 2:
                // Change instance brightness
                const { brightness } = await prompts({
                    name: "brightness",
                    type: "number",
                    message: "Enter the brightness you want to set",
                    validate: i => i ? true : menu()
                });
                if (!brightness) return menu();
                let brightnessNum = Number(brightness);
                if (brightnessNum == NaN) {
                    console.log(`Input is not a number!`);
                    return menu();
                } else if (brightnessNum < 0) brightnessNum = 0; else if (brightnessNum > 100) brightnessNum = 100;
                await req("/state", { bri: Math.round(brightnessNum * 2.55) }).then(() => {
                    info.state.on = true;
                    info.state.bri = Math.round(brightnessNum * 2.55);
                    console.log(`Brightness is now set to ${brightnessNum}% (${info.state.bri})!`);
                }).catch(() => console.log(`Failed to set brightness to ${brightnessNum}%!`));
                menu();
                break;
            case 3:
                // Change instance preset
                const { preset } = await prompts({
                    name: "preset",
                    type: "number",
                    message: "Enter the preset ID you want to set",
                    validate: i => i ? true : menu()
                });
                if (!preset) return menu();
                let presetNum = Number(preset);
                if (presetNum == NaN) {
                    console.log(`Input is not a number!`);
                    return menu();
                }
                await req("/state", { ps: presetNum }).then(() => {
                    info.state.ps = presetNum;
                    console.log(`Preset ID has been set to ${presetNum}!`);
                }).catch(() => console.log(`Failed to set preset ID to ${presetNum}!`));
                menu();
                break;
            case 4:
                // Log info
                console.log("       [INFO]");
                console.log(`Status:        ${info.state.on ? "ON" : "OFF"}`);
                console.log(`Preset:        ${(info.state.ps < 0) ? "None" : info.state.ps}`);
                console.log(`Playlist:      ${(info.state.pl < 0) ? "None" : info.state.pl}`);
                console.log(`Brightness:    ${Math.round(info.state.bri / 2.55)}% (${info.state.bri})`);
                console.log(`Name:          ${info.info.name}`);
                console.log(`LED count:     ${info.info.leds.count}`);
                if (info.advanced) {
                // Log advanced info
                console.log("   [ADVANCED INFO]");
                console.log(`WLED Version:  ${info.info.ver}`);
                console.log(`Uptime:        ${Math.floor(info.info.uptime / 86400)} days`);
                console.log(`Architecture:  ${info.info.arch.toUpperCase()}`);
                console.log(`Free heap:     ${info.info.freeheap / 1000} KB`);
                console.log(`MAC:           ${info.info.mac.toUpperCase()}`);
                }
                menu();
                break;
            default:
                console.log("Option not implemented yet!");
                menu();
                break;
        }
    })();
})();

// Functions

/**
 * Checks if string is valid IP
 * @param {string} ip IP to check
 * @returns {Boolean}
 */
function verifyIp(ip) {
    const split = ip.split(".");
    let valid = true;
    if (split.length != 4) return false;
    split.forEach(i => {
        if (!Number(i) || ((Number(i) < 0 || Number(i) > 255))) valid = false;
    });
    if (!valid) return false; else return split;
}

/**
 * Sends requests to WLED JSON API
 * @param {string} path WLED JSON path
 * @param {Object} body Additional body
 */
function req(path = "/", body) {
    return new Promise((resolve, reject) => {
        const i = http.request({
            method: body ? "POST" : "GET",
            headers: { "Content-Type": "application/json" },
            host: info.instance,
            path: `/json${path}`,
        }, res => {
            if (res.statusCode >= 400 && res.statusCode <= 499) reject(`Error status code returned! ${res.statusCode}: ${res.statusMessage}`);
            if (res.statusCode >= 500 && res.statusCode <= 599) reject(`Server error status code returned! ${res.statusCode}: ${res.statusMessage}`);
            let string = "";
            res.on("data", i => string += i);
            res.on("end", () => { try { resolve(JSON.parse(string)) } catch (err) { reject(`Failed to parse JSON, String response: ${string || "None"}, Error: ${err}`) } });
            res.on("error", err => reject(`Request failed, Error: ${err}`));
        });
        i.end(body ? JSON.stringify(body) : undefined);
    });
}

/**
 * Update WLED info
 */
function updateInfo() {
    return new Promise((resolve, reject) => req().then(i => { info.json = i; info.info = info.json.info; info.state = info.json.state; resolve(i); }).catch(err => reject(err)))
}
