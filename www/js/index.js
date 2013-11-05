/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
var app = {
    // Application Constructor
    initialize: function() {
        this.bindEvents();
    },
    // Bind Event Listeners
    //
    // Bind any events that are required on startup. Common events are:
    // `load`, `deviceready`, `offline`, and `online`.
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
    },

    // deviceready Event Handler
    //
    // The scope of `this` is the event. In order to call the `receivedEvent`
    // function, we must explicity call `app.receivedEvent(...);`
    onDeviceReady: function() {
        app.receivedEvent('deviceready');

    },

    // Update DOM on a Received Event
    receivedEvent: function(id) {
        var parentElement = document.getElementById(id);
        var listeningElement = parentElement.querySelector('.listening');
        var receivedElement = parentElement.querySelector('.received');

        listeningElement.setAttribute('style', 'display:none;');
        receivedElement.setAttribute('style', 'display:block;');

        var cbs = {
            fault: onFault,
            inform: onInform,
            scanResult: onScanResult,
            eventStored: onEventStored,
            eventListChange: onEventListChanged,
            eventListExport: onEventListExport
        };

        scanManager = this.ScanManagerClass().instance().callbacks(cbs);
        document.getElementById('scan').addEventListener('click', scanManager.scan, false);
        document.getElementById('export').addEventListener('click', scanManager.exportEvents, false);

        function onFault(message) {
            // alert(message);
            onInform("[ERROR]" + message);
        }
        function onInform(message) {
            document.getElementById("info").innerHTML = message;
            console.log(message);
        }

         function onScanResult(result) {
            var qr = result;
            console.log(qr);
            // alert(["We got a barcode","Result: " + qr.text,"Format: " + qr.format, "Cancelled: " + qr.cancelled].join("\n"));
            onInform(qr.text);

            onInform("about to get location");

            navigator.geolocation.getCurrentPosition(
                function(position) {
                    onInform("Location: ", position.coords.latitude);
                    onLocationResult(position.coords.latitude, position.coords.longitude);
                },
                function(err) {
                    onInform("Problem!");
                    onFault("Couldn't load the location");
                    onLocationResult("","");
                }
            );

            function onLocationResult(latitude, longitude) {
                onInform("Location: ", latitude, longitude);
                var timestamp = Math.round((new Date()).getTime() / 1000); // unix timestamp, in seconds
                scanManager.storeEvent(qr.text, timestamp, latitude, longitude);
            }
        }
        function onEventStored(text, timestamp, latitude, longitude) {
            onInform("[PASS] stored " + [text,timestamp,latitude, longitude].join(", "));
            scanManager.listEvents();
        }

        function onEventListChanged(rows) {
            onInform("[PASS] new list obtained " + rows.length);
            console.log(rows, [].splice.call(rows.item,0));

            function listColumns(item) {
                return Object.keys(item).map(function(key) { return item[key]; });
            }

            function listKeys(item) {
                return Object.keys(item);
            }

            var tr = [];
            var first = rows.length - 1, last = Math.max(first - 5, 0);
            for (var i = first; i > last; i--){
                console.log(i, first, i === first);
                var cols = (i === first ) ? listKeys(rows.item(i)) : listColumns(rows.item(i));
                tr.push(["<tr><td>", cols.join("</td><td>"), "</td></tr>"].join(""));
                console.log();
            }

            document.getElementById("table").innerHTML = ["<table>", tr.join("\n"), "</table>"].join("\n");

        }
        function onEventListExport(rows) {
            onInform("[PASS] new list obtained " + rows.length);
            document.getElementById("capturable").innerHTML = "getting ready";
            console.log(rows, [].splice.call(rows.item,0));

            function listColumns(item) {
                return Object.keys(item).map(function(key) { return item[key]; });
            }

            function listKeys(item) {
                return Object.keys(item);
            }

            var tr = [];
            var first = rows.length - 1, last = Math.max(first - 5, 0);
            for (var i = first; i > last; i--){
                console.log(i, first, i === first);
                var cols = (i === first ) ? listKeys(rows.item(i)) : listColumns(rows.item(i));
                tr.push(cols.join("\t"));
            }

            document.getElementById("capturable").innerHTML = tr.join("\n");

        }
    },

    ScanManagerClass: function() {
        var Class = {};
        Class.instance = function() {
            var instance = {}, on = {};

            instance.callbacks = function(obj) {
                var noAction = function() {};
                "fault,inform,scanResult,eventStored,eventListChange,eventListExport".split(",").forEach(function(eventName) {
                    on[eventName] = obj[eventName] || noAction;
                });
                return instance;
            };

            instance.scan = function() {
                if(window.cordova === undefined) { on.scanResult({text: "broccoli", format: "X"}); return; }
                var scanner = cordova.require("cordova/plugin/BarcodeScanner");
                scanner.scan(on.scanResult, function() { on.fault("Scanning failed: "+ error); });
            };

            function openDB() {
                return window.openDatabase("scans", "1.0", "Scans", 1000000);
            }

            function onTransactionFail(err) { on.fault("Error processing SQL: "+err.code); }

            function init() {
                openDB().transaction(function(tx) {
                    // tx.executeSql('DROP TABLE IF EXISTS Events');
                    tx.executeSql(
                        'CREATE TABLE IF NOT EXISTS Events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventtext TEXT NOT NULL, timestamp TEXT, latitude TEXT, longitude TEXT)',
                        [],
                        function(tx, results) { on.inform("Database initialized"); },
                        function(err) { on.fault("Error processing SQL: "+err.code); }
                    );
                });
            }
            

            instance.storeEvent = function(text, timestamp, latitude, longitude) {
                on.inform("about to store")
                openDB().transaction(function(tx) {
                    tx.executeSql(
                        'INSERT INTO Events (eventtext, timestamp, latitude, longitude) VALUES (?, ?, ?, ?)',
                        [text, timestamp, latitude, longitude],
                        function(tx, results) { on.eventStored(text, timestamp, latitude, longitude); },
                        function(err) { on.fault("Error processing SQL: "+err.code); }
                    );
                });

            };

            instance.listEvents = function() {
                on.inform("about to list")
                openDB().transaction(function(tx) {
                    tx.executeSql(
                        'SELECT * from Events',
                        [],
                        function(tx, results) { on.eventListChange(results.rows); },
                        function(err) { on.fault("Error processing SQL: "+err.code); }
                    );
                });
            };


            instance.exportEvents = function() {
                on.inform("about to export")
                openDB().transaction(function(tx) {
                    tx.executeSql(
                        'SELECT * from Events',
                        [],
                        function(tx, results) { on.inform("list exported"); on.eventListExport(results.rows);  },
                        function(err) { on.fault("Error processing SQL: "+err.code); }
                    );
                });
            };


            /*
            if (args.format == "QR_CODE") {
                window.plugins.childBrowser.showWebPage(args.text, { showLocationBar: false });
            }
            */

            instance.encode = function(qr) {
                var scanner = cordova.require("cordova/plugin/BarcodeScanner");
                qr = {format: scanner.Encode.TEXT_TYPE, text: "http://www.nhl.com"};

                scanner.encode(qr.format, qr.text, function(success) {
                    alert("encode success: " + success);
                  }, function(fail) {
                    alert("encoding failed: " + fail);
                  }
                );
            };

            init();
            return instance;
        };

        return Class;

    }


};
