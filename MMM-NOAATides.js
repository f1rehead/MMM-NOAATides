/* global Module */

/* MagicMirror²
 * Module: MMM-NOAATides
 *
 * By Corey Rice - Gracious help from Sam Detweiler & Karsten13 (on MM Discord)
 * MIT Licensed.
 */

Module.register('MMM-NOAATides', {
  APIparams: {
    predicted: "",
    measured: "",
    hilo: ""
  },
  NOAA: {
    station_name: "",
    units: "",
    measured_times: [],
    measured_tides: [],
    predicted_times: [],
    predicted_tides: [],
    hilo_events: [],
    chart: {
      context: "",
      content: ""
    }
  },

  nextTidesDomId: "",

  config: null,

  defaults: {
    stationID: String(8465705),
    datum: "MSL",
    time: "lst_ldt",
    units: "english",
    showHeader: false,
    updateInterval: 2500,
    animationSpeed: 1000 * 60 * 6,
    initialLoadDelay: 2500,
    retryDelay: 2500,
    apiBase: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=",

    chartJS: {
      measured: {
        backgroundColor: "rgba(31, 133, 224, 0.25)",
        borderColor: "rgb(31, 133, 224, 0.75)",
        pointBorderColor: "rgba(31, 133, 224, 0)",
        pointBackgroundColor: "rgba(31, 133, 224, 0)"
      },
      predicted: {
        borderColor: "gray",
        pointBorderColor: "rgba(0,0,0,0)",
        pointBackgroundColor: "rgba(0,0,0,0)"
      },
      animationDuration: 0,
      aspectRatio: 1.618,
      fillBetween: true
    }
  },

  start: function () {
    Log.log(this.name + " is starting!");

    this.NOAA.units = this.config.units === "metric" ? "metric" : "english";
    this.nextTidesDomId = "MMM-NOAATides-next-" + String(this.identifier || "0").replace(/\W/g, "-");
    this.getNewTides();
    this.scheduleUpdate(this.config.initialLoadDelay);

    var self = this;
    setInterval(function () {
      self.getNewTides();
    }, this.config.animationSpeed);

    setInterval(function () {
      self.refreshNextTidesDisplay();
    }, 30000);
  },

  getHeader: function () {
    return this.config.showHeader ? "Tides " + this.NOAA.station_name : "";
  },

  getNewTides: function () {
    const today = new Date();
    const year = String(today.getFullYear());
    let month = String(today.getMonth() + 1).padStart(2, "0");
    let date = String(today.getDate()).padStart(2, "0");
    const NOAA_today = year + month + date;

    const tomorrowDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const NOAA_tomorrow = String(tomorrowDate.getFullYear())
      + String(tomorrowDate.getMonth() + 1).padStart(2, "0")
      + String(tomorrowDate.getDate()).padStart(2, "0");

    this.APIparams.predicted = `${this.config.apiBase}${NOAA_today}&end_date=${NOAA_today}&station=${this.config.stationID}&product=predictions&datum=${this.config.datum}&time_zone=${this.config.time}&units=${this.NOAA.units}&format=json`;
    this.APIparams.measured = `${this.config.apiBase}${NOAA_today}&end_date=${NOAA_today}&station=${this.config.stationID}&product=water_level&datum=${this.config.datum}&time_zone=${this.config.time}&units=${this.NOAA.units}&format=json`;
    this.APIparams.hilo = `${this.config.apiBase}${NOAA_today}&end_date=${NOAA_tomorrow}&station=${this.config.stationID}&product=predictions&interval=hilo&datum=${this.config.datum}&time_zone=${this.config.time}&units=${this.NOAA.units}&format=json`;

    var request_params = JSON.stringify({
      predicted: this.APIparams.predicted,
      measured: this.APIparams.measured,
      hilo: this.APIparams.hilo,
      identifier: this.identifier
    });
    this.sendSocketNotification('START', request_params);
    this.updateDom();
  },

  getScripts: function () {
    return [
      this.file('node_modules/chart.js/dist/Chart.min.js'),
      this.file('node_modules/chartjs-plugin-annotation/chartjs-plugin-annotation.min.js')
    ];
  },

  getStyles: function () {
    return ["MMM-NOAATides.css"];
  },

  getDom: function () {
    var wrapper = document.createElement("div");

    var chartWrapper = document.createElement("div");
    chartWrapper.className = "MMM-NOAATides vertical-screen large";
    wrapper.appendChild(chartWrapper);

    var chart = document.createElement("canvas");
    chart.id = "NOAATideChart";
    this.NOAA.chart.context = chart.getContext('2d');

    var predictedTimes = this.NOAA.predicted_times;
    if (predictedTimes && predictedTimes.length > 0) {
      this.drawChart();
    } else {
      chart.innerHTML = "Loading";
    }

    wrapper.appendChild(chart);

    var nextLine = document.createElement("div");
    nextLine.className = "MMM-NOAATides-next-line bright";
    nextLine.id = this.nextTidesDomId;
    nextLine.innerHTML = this.buildNextTidesHtml();
    wrapper.appendChild(nextLine);

    return wrapper;
  },

  parseNOAATimestamp: function (t) {
    if (!t) {
      return null;
    }
    var d = new Date(String(t).replace(" ", "T"));
    return isNaN(d.getTime()) ? null : d;
  },

  getNextNotableTidesUpcoming: function (count) {
    var limit = typeof count === "number" ? count : 2;
    var events = this.NOAA.hilo_events || [];
    var now = Date.now();

    var items = [];
    var i = 0;
    for (; i < events.length; i++) {
      var ev = events[i];
      var when = this.parseNOAATimestamp(ev.t);
      if (!when) {
        continue;
      }
      items.push({ when: when, hl: ev.hl });
    }

    items.sort(function (a, b) {
      return a.when.getTime() - b.when.getTime();
    });

    items = items.filter(function (it) {
      return it.when.getTime() > now;
    });

    return items.slice(0, limit);
  },

  formatTideClock: function (d) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  },

  buildNextTidesHtml: function () {
    var upcoming = this.getNextNotableTidesUpcoming(2);
    var labelCls = "MMM-NOAATides-next-label dimmed";
    var partsHtml = "";

    var j = 0;
    for (; j < upcoming.length; j++) {
      var piece = upcoming[j];
      var word = piece.hl === "high" ? "High" : "Low";
      var timeStr = this.formatTideClock(piece.when);
      var pieceCls = "MMM-NOAATides-next-tide" + (j > 0 ? " MMM-NOAATides-next-tide-shift" : "");
      partsHtml += '<span class="' + pieceCls + '">' + word + " " + timeStr + "</span>";
    }

    var empty = upcoming.length === 0;
    var body = empty
      ? '<span class="MMM-NOAATides-next-placeholder dimmed">—</span>'
      : '<span class="MMM-NOAATides-next-tides">' + partsHtml + "</span>";

    return (
      '<span class="' + labelCls + '">Next:</span> ' +
      body
    );
  },

  refreshNextTidesDisplay: function () {
    if (typeof document === "undefined") {
      return;
    }
    var el = document.getElementById(this.nextTidesDomId);
    if (!el) {
      return;
    }
    el.innerHTML = this.buildNextTidesHtml();
  },

  scheduleUpdate: function (delay) {
    var nextLoad = this.config.updateInterval;
    if (typeof delay !== "undefined" && delay >= 0) {
      nextLoad = delay;
    }

    var self = this;
    setTimeout(function () {
      self.getNewTides();
    }, nextLoad);
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "NOAA_TIDES_RESULT") {
      var helper_NOAA = JSON.parse(payload);
      if (helper_NOAA.identifier !== this.identifier) {
        return;
      }
      Log.log(this.name + " module received notification from node_helper about: " + helper_NOAA.station_name);
      this.NOAA.station_name = helper_NOAA.station_name || "";
      this.NOAA.measured_times = helper_NOAA.measured_times || [];
      this.NOAA.measured_tides = helper_NOAA.measured_tides || [];
      this.NOAA.predicted_times = helper_NOAA.predicted_times || [];
      this.NOAA.predicted_tides = helper_NOAA.predicted_tides || [];
      this.NOAA.hilo_events = helper_NOAA.hilo_events || [];

      this.updateDom();
    }
  },

  drawChart: function () {
    // Convert times to Date objects and pair with tide data
    var measuredTimes = this.NOAA.measured_times || [];
    var measuredTides = this.NOAA.measured_tides || [];
    var predictedTimes = this.NOAA.predicted_times || [];
    var predictedTides = this.NOAA.predicted_tides || [];

    const measuredData = measuredTimes.map(function (time, index) {
      return {
        x: new Date(time),
        y: measuredTides[index]
      };
    });

    const predictedData = predictedTimes.map(function (time, index) {
      return {
        x: new Date(time),
        y: predictedTides[index]
      };
    });

    const currentTime = new Date(); // Current time as Date object

    // No need to register the plugin in Chart.js 2.x

    var existingChart = this.NOAA.chart.content;
    if (existingChart && typeof existingChart.destroy === "function") {
      existingChart.destroy();
    }

    this.NOAA.chart.content = new Chart(this.NOAA.chart.context, {
      type: 'line',
      data: {
        datasets: [{
          label: this.config.showHeader ? "" : "Tides:" + this.NOAA.station_name, // hide dataset label when module header shows
          data: '',
        }, {
          label: 'Measured',
          data: measuredData,
          fill: this.config.chartJS.fillBetween ? '+1' : false,
          backgroundColor: this.config.chartJS.measured.backgroundColor,
          borderColor: this.config.chartJS.measured.borderColor,
          pointBorderColor: this.config.chartJS.measured.pointBorderColor,
          pointBackgroundColor: this.config.chartJS.measured.pointBackgroundColor
        }, {
          label: 'Predicted',
          data: predictedData,
          fill: false,
          backgroundColor: this.config.chartJS.predicted.backgroundColor,
          borderColor: this.config.chartJS.predicted.borderColor,
          pointBorderColor: this.config.chartJS.predicted.pointBorderColor,
          pointBackgroundColor: this.config.chartJS.predicted.pointBackgroundColor
        }]
      },
      options: {
        aspectRatio: this.config.chartJS.aspectRatio,
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true,
              callback: function (value) {
                return value + ' ft';
              }
            }
          }],
          xAxes: [{
            type: 'time',
            time: {
              unit: 'hour',
              displayFormats: {
                hour: 'h:mm a'
              }
            },
            ticks: {
              source: 'auto',
              autoSkip: true,
              maxTicksLimit: 10
            }
          }]
        },
        animation: {
          duration: this.config.chartJS.animationDuration
        },
        annotation: {
          annotations: [{
            type: 'line',
            mode: 'vertical',
            scaleID: 'x-axis-0',
            value: currentTime,
            borderColor: 'red',
            borderWidth: 2,
            label: {
              content: 'Current Time',
              enabled: true,
              position: 'top'
            }
          }]
        }
      }
    });
  }

});
