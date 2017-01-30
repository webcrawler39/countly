'use strict';
const assistantJob = {},
    plugins = require('../../pluginManager.js'),
    log = require('../../../api/utils/log.js')('assistantJob:module'),
    fetch = require('../../../api/parts/data/fetch.js'),
    async = require("async"),
    countlySession = require('../../../api/lib/countly.session.js'),
    assistant = require("./assistant.js"),
    parser = require('rss-parser');

(function (assistantJob) {
    const PLUGIN_NAME = "assistant-base";
    assistantJob.prepareNotifications = function (db, providedInfo) {
        return new Promise(function (resolve, reject) {
            try {
                log.i('Creating assistant notifications from [%j]', PLUGIN_NAME);
                const NOTIFICATION_VERSION = 1;

                async.map(providedInfo.appsData, function (ret_app_data, callback) {
                    //assistant plugin common fields
                    const apc = assistant.preparePluginSpecificFields(providedInfo, ret_app_data, PLUGIN_NAME);

                    const params = {};//todo make an easy way to create empty param
                    params.qstring = {};
                    params.appTimezone = ret_app_data.timezone;//todo add this to other places

                    apc.db.collection('events').findOne({_id: apc.app_id}, {}, function (events_err, events_result) {
                        params.app_id = apc.app_id;
                        params.qstring.period = "7days";

                        fetch.getTimeObj('users', params, function (fetchResultUsers) {//collect user info
                            //log.i('Assistant plugin doing steps: [%j] [%j]', 0.01, fetchResultUsers);
                            countlySession.setDb(fetchResultUsers);
                            const retSession = countlySession.getSessionData();

                            log.i('Assistant plugin doing steps: [%j] [%j] [%j] [%j]', 0.1, params.app_id, apc.app_id);

                            // (1) generate quick tip notifications
                            // (1.1) Crash integration
                            apc.db.collection("app_crashgroups" + apc.app_id).findOne({_id: "meta"}, function (err_crash, res_crash) {
                                //log.i('Assistant plugin doing steps: [%j][%j] ', 1, res_crash);
                                if (res_crash || apc.flagForceGenerate) {
                                    {
                                        const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.crash-integration", assistant.NOTIF_TYPE_QUICK_TIPS, 1, NOTIFICATION_VERSION);
                                        const crash_data_not_available = res_crash.crashes === 0;
                                        const enough_users = res_crash.users > 20;//total users > 20
                                        const max_show_time_not_exceeded = anc.valueSet.showAmount < 3;
                                        const data = [];

                                        assistant.createNotificationIfRequirementsMet(2, 14, (crash_data_not_available && enough_users && apc.is_mobile && max_show_time_not_exceeded), data, anc);
                                    }
                                }
                            });

                            { // (1.2) Push integration
                                const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.push-integration", assistant.NOTIF_TYPE_QUICK_TIPS, 2, NOTIFICATION_VERSION);
                                const no_certificate_uploaded = (typeof ret_app_data.gcm === "undefined") && (typeof ret_app_data.apn === "undefined");
                                const max_show_time_not_exceeded = anc.valueSet.showAmount < 3;
                                const data = [];

                                assistant.createNotificationIfRequirementsMet(3, 15, (no_certificate_uploaded && apc.is_mobile && max_show_time_not_exceeded), data, anc);
                            }

                            { // (1.4) Custom event integration
                                const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.custom-event-integration", assistant.NOTIF_TYPE_QUICK_TIPS, 3, NOTIFICATION_VERSION);
                                const no_custom_event_defined = (typeof events_result === "undefined") || (events_result === null);
                                const max_show_time_not_exceeded = anc.valueSet.showAmount < 3;
                                const data = [];

                                assistant.createNotificationIfRequirementsMet(5, 15, (no_custom_event_defined && apc.is_mobile && max_show_time_not_exceeded), data, anc);
                            }

                            // (1.5) Share dashboard
                            db.collection('members').find({user_of: apc.app_id}, {}).count(function (err1, userCount) {
                                const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.share-dashboard", assistant.NOTIF_TYPE_QUICK_TIPS, 3, NOTIFICATION_VERSION);
                                const not_enough_users = (userCount < 3);
                                const max_show_time_not_exceeded = anc.valueSet.showAmount < 1;
                                const data = [];

                                assistant.createNotificationIfRequirementsMet(5, 10, (not_enough_users && max_show_time_not_exceeded), data, anc);
                            });

                            // (2) generate insight notifications
                            { // (2.1) active users bow positive
                                const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.active-users-bow-pos", assistant.NOTIF_TYPE_INSIGHTS, 1, NOTIFICATION_VERSION);
                                const enough_active_users = retSession.total_users.total > 100;//active users > 20
                                const val_current_period = retSession.total_users.total;
                                const change_amount = parseFloat(retSession.total_users.change);
                                const enough_active_user_change = change_amount >= 10;
                                const val_previous_period = val_current_period / (change_amount / 100 + 1);
                                const data = [val_current_period, Math.round(val_previous_period)];

                                assistant.createNotificationIfRequirementsMet(1, 10, (enough_active_users && enough_active_user_change), data, anc);
                            }

                            { // (2.2) active users bow negative
                                const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.active-users-bow-neg", assistant.NOTIF_TYPE_INSIGHTS, 2, NOTIFICATION_VERSION);
                                const enough_active_users = retSession.total_users.total > 100;//active users > 20
                                const val_current_period = retSession.total_users.total;
                                const change_amount = parseFloat(retSession.total_users.change);
                                const enough_active_user_change = change_amount <= -10;
                                const val_previous_period = val_current_period / (change_amount / 100 + 1);
                                const data = [val_current_period, Math.round(val_previous_period)];

                                assistant.createNotificationIfRequirementsMet(1, 10, (enough_active_users && enough_active_user_change), data, anc);
                            }

                            { // (2.3) active users eow positive
                                const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.active-users-eow-pos", assistant.NOTIF_TYPE_INSIGHTS, 3, NOTIFICATION_VERSION);
                                const enough_active_users = retSession.total_users.total > 100;//active users > 20
                                const val_current_period = retSession.total_users.total;
                                const change_amount = parseFloat(retSession.total_users.change);
                                const enough_active_user_change = change_amount >= 10;
                                const val_previous_period = val_current_period / (change_amount / 100 + 1);
                                const data = [val_current_period, Math.round(val_previous_period)];

                                assistant.createNotificationIfRequirementsMet(4, 16, (enough_active_users && enough_active_user_change), data, anc);
                            }

                            {// (2.4) active users eow positive
                                const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.active-users-eow-neg", assistant.NOTIF_TYPE_INSIGHTS, 4, NOTIFICATION_VERSION);
                                const enough_active_users = retSession.total_users.total > 100;//active users > 20
                                const val_current_period = retSession.total_users.total;
                                const change_amount = parseFloat(retSession.total_users.change);
                                const enough_active_user_change = change_amount <= -10;
                                const val_previous_period = val_current_period / (change_amount / 100 + 1);
                                const data = [val_current_period, Math.round(val_previous_period)];

                                assistant.createNotificationIfRequirementsMet(4, 16, (enough_active_users && enough_active_user_change), data, anc);
                            }

                            { // (2.11) session duration bow positive
                                const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.avg-session-duration-bow-pos", assistant.NOTIF_TYPE_INSIGHTS, 5, NOTIFICATION_VERSION);
                                const enough_active_users = retSession.total_sessions.total > 100;//active users > 20
                                const val_current_period = retSession.avg_time.total;
                                const change_amount = parseFloat(retSession.avg_time.change);
                                const enough_session_duration_change = change_amount >= 10;
                                const val_previous_period = val_current_period / (change_amount / 100 + 1);
                                const data = [Math.floor(val_current_period), Math.round((val_current_period - Math.floor(val_current_period)) * 60), Math.floor(val_previous_period), Math.round((val_previous_period - Math.floor(val_previous_period)) * 60)];

                                assistant.createNotificationIfRequirementsMet(4, 16, (enough_active_users && enough_session_duration_change), data, anc);
                            }
                            //todo iespējams gan pozitīvam, gan negatīvam variantam jāiedod tas pats id
                            { // (2.12) session duration bow negative
                                const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.avg-session-duration-bow-neg", assistant.NOTIF_TYPE_INSIGHTS, 6, NOTIFICATION_VERSION);
                                const enough_active_users = retSession.total_sessions.total > 100;//active users > 20
                                const val_current_period = parseFloat(retSession.avg_time.total);
                                if (retSession.avg_time.change === "NA") retSession.avg_time.change = "0";
                                const change_amount = parseFloat(retSession.avg_time.change);
                                const enough_session_duration_change = change_amount <= -10;
                                const val_previous_period = val_current_period / (change_amount / 100 + 1);//todo check the math
                                const data = [Math.floor(val_current_period), Math.round((val_current_period - Math.floor(val_current_period)) * 60), Math.floor(val_previous_period), Math.round((val_previous_period - Math.floor(val_previous_period)) * 60)];

                                assistant.createNotificationIfRequirementsMet(4, 16, (enough_active_users && enough_session_duration_change), data, anc);
                            }

                            {
                                const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.custom-event-integration", assistant.NOTIF_TYPE_QUICK_TIPS, 3, NOTIFICATION_VERSION);
                                const hours_24 = 1000*60*60*24;
                                const nowTime = 1485547643000;

                                const paramCopy = {};
                                paramCopy.api_key = params.api_key;
                                paramCopy.app_id = params.app_id;
                                paramCopy.appTimezone = params.appTimezone;
                                paramCopy.qstring = {};
                                paramCopy.qstring.period = "7days";// JSON.stringify([nowTime - hours_24,nowTime]);

                                fetch.getMetric(paramCopy, "sources", null, function(metricData){
                                    //log.i('Assistant plugin doing steps: [%j] [%j] [%j] [%j]', 12, params.app_id, app_id, metricData);

                                    metricData = metricData.filter(function (x) {
                                        return x.t > 0;
                                    });
                                    metricData.sort(function (x, y) {
                                        return y.t - x.t;
                                    });

                                    //log.i('Sorted Data [%j] [%j]', app_id, metricData);
                                    const enough_sources = metricData.length >= 3;//at least 3 install sources with enough users

                                    if(apc.is_mobile) {
                                        let data;
                                        if(enough_sources) {
                                            data = [metricData[0]._id, metricData[0].t, metricData[1]._id, metricData[1].t, metricData[2]._id, metricData[2].t];
                                        } else {
                                            data = ["a", 1, "b", 2, "c", 3];
                                        }

                                        const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.top-install-sources", assistant.NOTIF_TYPE_INSIGHTS, 7, NOTIFICATION_VERSION);
                                        assistant.createNotificationIfRequirementsMet(5, 15, (enough_sources && apc.is_mobile), data, anc);
                                    } else {
                                        let data;
                                        if(enough_sources) {
                                            data = [metricData[0]._id, metricData[0].t, metricData[0].u, metricData[1]._id, metricData[1].t, metricData[1].u, metricData[2]._id, metricData[2].t, metricData[2].u];
                                        } else {
                                            data = ["a", 1, 9, "b", 2, 8, "c", 3, 7];
                                        }

                                        const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.top-referrals", assistant.NOTIF_TYPE_INSIGHTS, 8, NOTIFICATION_VERSION);
                                        assistant.createNotificationIfRequirementsMet(5, 15, (enough_sources && !apc.is_mobile), data, anc);
                                    }
                                });
                            }

                            //log.i('Assistant plugin doing steps BIG: [%j] ', 20);
                            // (3) generate announcment notifications

                            //todo combine all feed readers
                            //todo improve feed period selection so that it is possible to show the event immediate and not once per day
                             // (3.1) blog page

                            const nowTimestamp = Date.now();//timestamp now ms
                            const intervalMs = 24 * 60 * 60 * 1000;//the last 24 hours in ms

                            parser.parseURL('https://medium.com/feed/countly', function(err, parsed) {
                                //log.i(parsed.feed.title);
                                parsed.feed.entries.forEach(function(entry) {
                                    const eventTimestamp = Date.parse(entry.pubDate);//rss post timestamp

                                    const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.announcement-blog-post", assistant.NOTIF_TYPE_ANNOUNCEMENTS, 1, NOTIFICATION_VERSION);
                                    const blog_post_ready = (nowTimestamp - eventTimestamp) <= intervalMs;//the rss post was published in the last 24 hours
                                    const data = [entry.title, entry.link];

                                    assistant.createNotificationIfRequirementsMet(-1, 15, (blog_post_ready), data, anc);
                                });
                            });

                            log.i('Assistant plugin stuffo: [%j] ', 8);
                            // (3.2) New iOS SDK release
                            parser.parseURL('https://github.com/countly/countly-sdk-ios/releases.atom', function(err, parsed) {
                                //log.i(parsed.feed.title);
                                parsed.feed.entries.forEach(function(entry) {
                                    const eventTimestamp = Date.parse(entry.pubDate);//rss post timestamp

                                    const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.announcement-ios-release", assistant.NOTIF_TYPE_ANNOUNCEMENTS, 2, NOTIFICATION_VERSION);
                                    const blog_post_ready = (nowTimestamp - eventTimestamp) <= intervalMs;//the rss post was published in the last 24 hours
                                    const data = [entry.title, entry.link];

                                    assistant.createNotificationIfRequirementsMet(-1, 15, (blog_post_ready), data, anc);
                                });
                            });

                            // (3.3) New Android SDK release
                            parser.parseURL('https://github.com/countly/countly-sdk-android/releases.atom', function(err, parsed) {
                                //log.i(parsed.feed.title);
                                parsed.feed.entries.forEach(function(entry) {
                                    const eventTimestamp = Date.parse(entry.pubDate);//rss post timestamp

                                    const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.announcement-android-release", assistant.NOTIF_TYPE_ANNOUNCEMENTS, 3, NOTIFICATION_VERSION);
                                    const blog_post_ready = (nowTimestamp - eventTimestamp) <= intervalMs;//the rss post was published in the last 24 hours
                                    const data = [entry.title, entry.link];

                                    assistant.createNotificationIfRequirementsMet(-1, 15, (blog_post_ready), data, anc);
                                });
                            });

                            // (3.3) New community server release
                            parser.parseURL('https://github.com/Countly/countly-server/releases.atom', function(err, parsed) {
                                //log.i(parsed.feed.title);
                                parsed.feed.entries.forEach(function(entry) {
                                    const eventTimestamp = Date.parse(entry.pubDate);//rss post timestamp

                                    const anc = assistant.prepareNotificationSpecificFields(apc, "assistant.announcement-community-server-release", assistant.NOTIF_TYPE_ANNOUNCEMENTS, 4, NOTIFICATION_VERSION);
                                    const blog_post_ready = (nowTimestamp - eventTimestamp) <= intervalMs;//the rss post was published in the last 24 hours
                                    const data = [entry.title, entry.link];

                                    assistant.createNotificationIfRequirementsMet(-1, 15, (blog_post_ready), data, anc);
                                });
                            });
                            log.i('Assistant plugin stuffo: [%j] ', 9);
                            callback(null, null);
                        });
                    });
                }, function (err, results) {
                    log.i('Assistant for [%j] plugin resolving', PLUGIN_NAME);
                    resolve();
                });
            } catch (ex) {
                log.i('Assistant plugin [%j] FAILED!!!!! [%j]', PLUGIN_NAME, ex);
                resolve();
            }
        });
    }
}(assistantJob));

module.exports = assistantJob;
