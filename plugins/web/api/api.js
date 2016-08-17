var plugin = {},
    useragent = require('useragent'),
	common = require('../../../api/utils/common.js'),
    plugins = require('../../pluginManager.js');

(function (plugin) {
    plugins.register("/session/metrics", function(ob){
        var params = ob.params;
        if(params.app.type == "web"){
            if(!params.qstring.metrics)
                params.qstring.metrics = {};

            //if some metrics are not provided, parse them from user agent
            var agent = useragent.parse(params.req.headers['user-agent'], params.qstring.metrics._ua);
            
            if(!params.qstring.metrics._browser)
                params.qstring.metrics._browser = agent.family;
            
            if(!params.qstring.metrics._os)
                params.qstring.metrics._os = agent.os.family;
            
            if(!params.qstring.metrics._os_version && (agent.os.major != 0 || agent.os.minor != 0 || agent.os.patch != 0))
                params.qstring.metrics._os_version = agent.os.toVersion();
            
            if(!params.qstring.metrics._device && agent.device.family != "Other")
                params.qstring.metrics._device = agent.device.family;
        }
	});
    
	plugins.register("/o", function(ob){
		var params = ob.params;
		var validateUserForDataReadAPI = ob.validateUserForDataReadAPI;
		if (params.qstring.method == "latest_users") {
            validateUserForDataReadAPI(params, function(){
                common.db.collection("app_users"+params.app_id).find({_id:{$ne:"uid-sequence"}}).sort({ls:-1}).limit(50).toArray(function(err, users){
                    if(!err)
                        common.returnOutput(params, users);
                    else
                        common.returnMessage(params, 400, 'Error occured');
                });
            });
			return true;
		}
		return false;
	});
}(plugin));

module.exports = plugin;