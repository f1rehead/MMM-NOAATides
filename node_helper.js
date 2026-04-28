/* MagicMirror²
 * Node Helper: MMM-NOAATides
 *
 * By Corey Rice - Gracious help from Sam Detweiler & Karsten13 (on MM Discord)
 * MIT Licensed.
 */

var NodeHelper = require("node_helper");
var fetch = require("node-fetch");

module.exports = NodeHelper.create({
    // Subclass start method.
    start: function () {
        console.log("Started node_helper.js for " + this.name);
    },

    socketNotificationReceived: function (notification, payload) {
        var request = JSON.parse(payload);
        this.NOAATidesRequest(request);
    },

    NOAATidesRequest: function (request) {
        var self = this;
        var identifier = request.identifier;

        var noaa = {
            station_name: "",
            measured_times: [],
            measured_tides: [],
            predicted_times: [],
            predicted_tides: [],
            hilo_events: []
        };

        var fetchMeasured = function () {
            return fetch(request.measured)
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error('Measured water level NOAA API response was not ok — check API URL or parameters');
                    }
                    return response.json();
                })
                .then(function (data) {
                    self.processMeasuredTidesData(data, noaa);
                });
        };

        var fetchPredicted = function () {
            return fetch(request.predicted)
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error('Predicted tides NOAA API response was not ok! -- Check API URL or parameters');
                    }
                    return response.json();
                })
                .then(function (data) {
                    self.processPredictedTidesData(data, noaa);
                });
        };

        var fetchHilo = function () {
            return fetch(request.hilo)
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error('High/Low NOAA API response was not ok — check API URL or parameters');
                    }
                    return response.json();
                })
                .then(function (data) {
                    self.processHiloPredictionsData(data, noaa);
                });
        };

        Promise.all([fetchMeasured(), fetchPredicted(), fetchHilo()])
            .then(function () {
                noaa.identifier = identifier;
                var string_NOAA = JSON.stringify(noaa);
                self.sendSocketNotification('NOAA_TIDES_RESULT', string_NOAA);
            })
            .catch(function (error) {
                console.error('MMM-NOAATides NOAA request error:', error);
            });
    },

    /*   /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\    /\
     *  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \  /  \
     * /    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \/    \
     */ //==== process the JSON from NOAA ===============================================================================
    processMeasuredTidesData: function (mTides, noaa) {
        noaa.station_name = mTides.metadata.name; //update the NOAA object's station_name to a real name

        noaa.measured_times = []; //reset the data
        noaa.measured_tides = []; //reset the data

        mTides.data.forEach(function (element) { //for each row of data obtained, parse out the times & heights
            noaa.measured_times.push(new Date(element.t)); //store the times as time objects
            noaa.measured_tides.push(Number(element.v)); //store the heights as numbers
        });
    },

    processPredictedTidesData: function (pTides, noaa) {
        noaa.predicted_times = []; //reset the data
        noaa.predicted_tides = []; //reset the data

        pTides.predictions.forEach(function (element) { //for each row of data obtained, parse out the times & heights
            noaa.predicted_times.push(new Date(element.t)); //store the times as time objects
            noaa.predicted_tides.push(Number(element.v)); //store the heights as numbers
        });

        //only predicted tides need the end of the day added -- they always cover the 24hrs
        var t = new Date();
        var endOfDay = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59);
        noaa.predicted_times.push(endOfDay);
    },

    processHiloPredictionsData: function (pTides, noaa) {
        noaa.hilo_events = [];
        if (!pTides.predictions || !Array.isArray(pTides.predictions)) {
            return;
        }
        pTides.predictions.forEach(function (row) {
            var typ = (row.type !== undefined && row.type !== null ? String(row.type) : "").toUpperCase();
            var hl = typ === "H" ? "high" : (typ === "L" ? "low" : null);
            if (!hl || !row.t) {
                return;
            }
            noaa.hilo_events.push({ t: row.t, hl: hl });
        });
    },
});
