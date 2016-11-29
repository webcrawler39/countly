(function (countlyAssistant, $, undefined) {

    //Private Properties
    var _data = {};
    countlyAssistant.initialize = function () {
        //CountlyHelpers.alert("2", "green");
        return $.ajax({
            type:"GET",
            url:countlyCommon.API_URL + "/o/assistant",
            data:{
                api_key:countlyGlobal['member'].api_key
            },
            success:function (json) {
                _data = json;
                //CountlyHelpers.alert(3, "green");
            }
        });
    };

    countlyAssistant.getData = function () {
        return _data;
    };

    var plugins = {};

    //countlyAssistant.addPlugin("crashes", "new_crash", function(){//do something})
    countlyAssistant.addPlugin = function(plugin, type, func){
        if(!plugins[plugin])
            plugins[plugin] = {};
        plugins[plugin][type] = func;
    };



    var timeSince = function (date) {

        var seconds = Math.floor((new Date() - date) / 1000);
        var interval = Math.floor(seconds / 31536000);

        if (interval > 1) {
            return interval + " years";
        }
        interval = Math.floor(seconds / 2592000);
        if (interval > 1) {
            return interval + " months";
        }
        interval = Math.floor(seconds / 86400);
        if (interval > 1) {
            return interval + " days";
        }
        interval = Math.floor(seconds / 3600);
        if (interval > 1) {
            return interval + " hours";
        }
        interval = Math.floor(seconds / 60);
        if (interval > 1) {
            return interval + " minutes";
        }
        return Math.floor(seconds) + " seconds";
    };



    var fixData = function (given_data) {
        var the_notifs = [given_data.notifications, given_data.notifs_saved_private, given_data.notifs_saved_global];

        for(var b = 0 ; b < the_notifs.length ; b++) {
            for (var a = 0; a < the_notifs[b].length; a++) {
                var obj = the_notifs[b][a];

                if(plugins[obj.plugin_name] && plugins[obj.plugin_name][obj.notif_type]) {
                    obj.msg = plugins[obj.plugin_name][obj.notif_type](obj);
                } else {
                    var arr = obj.data.slice();
                    arr.unshift(obj.i18n_id + ".message");
                    var res = jQuery.i18n.prop.apply(null, arr);

                    obj.title = jQuery.i18n.map[obj.i18n_id + ".title"];
                    obj.msg = res;
                }
                //todo sometines events with a negative time are returned
                obj.timeSince = timeSince(new Date(obj.created_date));
            }
        }

        return given_data;
    };

    countlyAssistant.getDataForApp = function (app_id) {
        //CountlyHelpers.alert(10, "green");
        for(var a = 0 ; a < _data.length ; a++){
            if(_data[a].id === app_id) return fixData(_data[a]);
        }
        CountlyHelpers.alert(11, "green");
        return [];//todo fix this
    };

    countlyAssistant.changeNotification = function (notif_id, is_private, save_it) {
        //CountlyHelpers.alert("1.1", "green");
        return $.ajax({
            type:"GET",
            url:countlyCommon.API_URL + "/i/assistant/" + (is_private?"private":"global"),
            data:{
                api_key:countlyGlobal['member'].api_key,
                save: save_it,
                notif: notif_id
            },
            success:function (json) {

            }
        });
    };

}(window.countlyAssistant = window.countlyAssistant || {}, jQuery));