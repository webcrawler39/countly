var plugins = require('./plugins.json'),
	pluginsApis = {}, 
	countlyConfig = require('../frontend/express/config'),
	fs = require('fs'),
	path = require('path'),
	cp = require('child_process'),
    async = require("async"),
	exec = cp.exec;
	
var pluginManager = function pluginManager(){
	var events = {};
	var plugs = [];
    var methodCache = {};
    var configs = {};
    var defaultConfigs = {};
    var excludeFromUI = {plugins:true};

	this.init = function(){
		for(var i = 0, l = plugins.length; i < l; i++){
			try{
				pluginsApis[plugins[i]] = require("./"+plugins[i]+"/api/api");
			} catch (ex) {
				console.error(ex.stack);
			}
		}
	}
    
    this.loadConfigs = function(db, callback, api){
        var self = this;
        db.collection("plugins").findOne({_id:"plugins"}, function(err, res){
            if(!err){
                configs = res || {};
                delete configs._id;
                self.checkConfigs(db, configs, defaultConfigs, callback);
                if(api)
                    self.checkPlugins(db);
            }
            else if(callback)
                callback();
        });
    }
    
    this.setConfigs = function(namespace, conf, exclude){
        defaultConfigs[namespace] = conf;
        if(exclude)
            excludeFromUI[namespace] = true;
    };
    
    this.getConfig = function(namespace){
        if(configs[namespace])
            return configs[namespace]
        return defaultConfigs[namespace] || {};
    };
    
    this.getAllConfigs = function(){
        //get unique namespaces
        var a = Object.keys(configs);
        var b = Object.keys(defaultConfigs);
        var c = a.concat(b.filter(function (item) { return a.indexOf(item) < 0; }));
        var ret = {};
        for(var i = 0; i < c.length; i++){
            if(!excludeFromUI[c[i]])
                ret[c[i]] = this.getConfig(c[i]);
        }
        return ret;
    }
    
    this.checkConfigs = function(db, current, provided, callback){
        var diff = getObjectDiff(current, provided);
        if(Object.keys(diff).length > 0){
            db.collection("plugins").update({_id:"plugins"}, {$set:flattenObject(diff)}, {upsert:true}, function(err, res){
                if(callback)
                    callback();
            });
        }
        else if(callback)
            callback();
    };
    
    this.updateConfigs = function(db, namespace, configs, callback){
        var update = {};
        if(namespace != "_id")
            update[namespace] = configs;
        db.collection("plugins").update({_id:"plugins"}, {$set:flattenObject(update)}, {upsert:true}, function(err, res){
            if(callback)
                callback();
        });
    };
    
    this.updateAllConfigs = function(db, configs, callback){
        db.collection("plugins").update({_id:"plugins"}, {$set:flattenObject(configs)}, {upsert:true}, function(err, res){
            if(callback)
                callback();
        });
    };
    
    this.extendModule = function(name, object){
        for(var i = 0, l = plugins.length; i < l; i++){
			try{
				require("./"+plugins[i]+"/extend/"+name)(object);
			} catch (ex) {}
		}
    }
	
	this.register = function(event, callback){
		if(!events[event])
			events[event] = [];
		events[event].push(callback);
	} 
	
	this.dispatch = function(event, params, callback){
        if(callback){
            if(events[event]){
                function runEvent(item, callback){
                    var ran = false,
                        timeout = null;
                    function pluginCallback(){
                        if(timeout){
                            clearTimeout(timeout);
                            timeout = null;
                        }
                        if(!ran){
                            ran = true;
                            callback(null, null);
                        }
                    }
                    try{
                        if(!item.call(null, params, pluginCallback)){
                            //don't wait for callback
                            pluginCallback();
                        }
                    } catch (ex) {
                        console.error(ex.stack);
                        //if there was an error, call callback just in case
                        pluginCallback();
                    }
                    //set time out if there is no response from plugin for some time
                    timeout = setTimeout(pluginCallback, 1000);
                }
                async.map(events[event], runEvent, function(){
                    callback(used);
                });
            }
        }
        else{
            var used = false;
            if(events[event]){
                try{
                    for(var i = 0, l = events[event].length; i < l; i++){
                        if(events[event][i].call(null, params))
                            used = true;
                    }
                } catch (ex) {
                    console.error(ex.stack);
                }
            }
            return used;
        }
	}
	
	this.loadAppPlugins = function(app, countlyDb, express){
        var self = this;
		for(var i = 0, l = plugins.length; i < l; i++){
            app.use(countlyConfig.path+'/'+plugins[i], express.static(__dirname + '/'+plugins[i]+"/frontend/public"));
        }
        app.use(function(req, res, next) {
            self.loadConfigs(countlyDb, function(){
                next();
            })
        });
        for(var i = 0, l = plugins.length; i < l; i++){
			try{
				var plugin = require("./"+plugins[i]+"/frontend/app");
				plugin.init(app, countlyDb, express);
				plugs.push(plugin);
			} catch (ex) {
				console.error(ex.stack);
			}
		}
	}
    
    this.callMethod = function(method, params){
        var res = false;
        if(methodCache[method]){
            if(methodCache[method].length > 0){
                for(var i = 0; i < methodCache[method].length; i++){
                    try{
                        if(methodCache[method][i][method](params)){
                            res = true;
                        }
                    } catch (ex) {
                        console.error(ex.stack);
                    }
                }
            }
        }
        else{
            methodCache[method] = [];
            for(var i = 0; i < plugs.length; i++){
                try{
                    if(plugs[i][method]){
                        methodCache[method].push(plugs[i]);
                        if(plugs[i][method](params)){
                            res = true;
                        }
                    }
                } catch (ex) {
                    console.error(ex.stack);
                }
            }
        }
        return res;
    }
	
	this.getPlugins = function(){
		return plugins;
	}
	
	this.getPluginsApis = function(){
		return pluginsApis;
	}
	
	this.setPluginApi = function(plugin, name, func){
		return pluginsApis[plugin][name] = func;
	}
	
	this.reloadPlugins = function(){
		delete require.cache[require.resolve('./plugins.json')];
		plugins = require('./plugins.json');
	}
    
    this.checkPlugins = function(db){
        var plugs = this.getConfig("plugins");
        if(Object.keys(plugs).length == 0){
            //no plugins inserted yet, upgrading by inserting current plugins
            var list = this.getPlugins();
            for(var i = 0; i < list.length; i++){
                plugs[list[i]] = true;
            }
            this.updateConfigs(db, "plugins", plugs);
        }
        else{
            this.syncPlugins(plugs);
        }
    };
    
    this.syncPlugins = function(pluginState, callback){
        var self = this;
        var dir = path.resolve(__dirname, './plugins.json');
        var pluginList = this.getPlugins().slice(), newPluginsList = pluginList.slice();
        var changes = 0;
		var transforms = Object.keys(pluginState).map(function(plugin){
			var state = pluginState[plugin],
				index = pluginList.indexOf(plugin);
			if (index !== -1 && !state) {
                changes++;
				newPluginsList.splice(newPluginsList.indexOf(plugin), 1);
				plugins.splice(plugins.indexOf(plugin), 1);
				return self.uninstallPlugin.bind(self, plugin);
			} else if (index === -1 && state) {
                changes++;
                plugins.push(plugin);
				newPluginsList.push(plugin);
				return self.installPlugin.bind(self, plugin);
			} else {
				return function(clb){ clb(); };
			}
		});

		async.parallel(transforms, function(error){
			if (error) {
                if(callback)
                    callback(true);
			} else {
                if(changes > 0){
                    async.series([fs.writeFile.bind(fs, dir, JSON.stringify(newPluginsList), 'utf8'), self.prepareProduction.bind(self)], function(error){
                        self.reloadPlugins();
                        if(callback)
                            callback(error ? true : false);
                        setTimeout(self.restartCountly.bind(self), 500);
                    });
                }
                else if(callback){
                    callback(false);
                }
			}
		});
    }
	
	this.installPlugin = function(plugin, callback){
		console.log('Installing plugin %j...', plugin);
		var ret = "";
		try{
			var dir = path.resolve(__dirname, '');
			var child = cp.fork(dir+"/"+plugin+"/install.js");
			var errors;
			var handler = function (error, stdout) {
				if (error){
					errors = true;					
					console.log('error: %j', error);
				}
				
				if(callback)
					callback(errors);
				console.log('Done installing plugin %j', plugin);
			};
			child.on('error', function(err){
				console.log(plugin + " install errored: " + err);
				var cmd = "cd "+dir+"/"+plugin+"; npm install";
				var child = exec(cmd, handler);
			}); 
			child.on('exit', function(code){
				var cmd = "cd "+dir+"/"+plugin+"; npm install";
				var child = exec(cmd, handler);
			}); 
		}
		catch(ex){
			console.log(ex.stack);
			errors = true;
			if(callback)
				callback(errors);
		}
	}
	
	this.uninstallPlugin = function(plugin, callback){
		console.log('Uninstalling plugin %j...', plugin);
		var ret = "";
		try{
			var dir = path.resolve(__dirname, '');
			var child = cp.fork(dir+"/"+plugin+"/uninstall.js");
			var errors;
			var handler = function (error, stdout) {
				if (error){
					errors = true;					
					console.log('error: %j', error);
				}
				
				if(callback)
					callback(errors);
			
				console.log('Done uninstalling plugin %j', plugin);
			};
			child.on('error', handler); 
			child.on('exit', handler); 
		}
		catch(ex){
			console.log(ex.stack);
			errors = true;
			if(callback)
				callback(errors);
		}
	}
	
	this.prepareProduction = function(callback) {
		console.log('Preparing production files');
		exec('grunt plugins locales', {cwd: path.join(__dirname, '..')}, function(error, stdout) {
			console.log('Done preparing production files with %j / %j', error, stdout);
			var errors;
			if (error && error != 'Error: Command failed: ') {
				errors = true;					
				console.log('error: %j', error);
			}
			if (callback) {
				callback(errors);
			}
		});
	};
	
	this.restartCountly = function(){
		console.log('Restarting Countly ...');
		if (process.env.INSIDE_DOCKER) {
			console.log('Restarting runit services ...');
			exec("sudo /usr/bin/sv restart countly-api countly-dashboard", function (error, stdout, stderr) {
				console.log('Done restarting runit services with %j / %j / %j', error, stderr, stdout);
				if(error)
					console.log('error: %j', error);
				if(stderr)
					console.log('stderr: %j', stderr);
			});
		} else {
			console.log('Restarting countly-supervisor ...');
			exec("sudo restart countly-supervisor", function (error, stdout, stderr) {
				console.log('Done restarting countly-supervisor with %j / %j / %j', error, stderr, stdout);
				if(error)
					console.log('error: %j', error);
				if(stderr)
					console.log('stderr: %j', stderr);
			});
		}
	}
    
    var getObjectDiff = function(current, provided){
        var toReturn = {};
        
        for (var i in provided) {
            if(typeof current[i] == "undefined"){
                toReturn[i] = provided[i];
            }
            else if((typeof provided[i]) == 'object' && provided[i] != null) {
                var diff = getObjectDiff(current[i], provided[i]);
                if(Object.keys(diff).length > 0)
                    toReturn[i] = diff;
            }
        }
        return toReturn;
    };
    
    var flattenObject = function(ob) {
        var toReturn = {};
        
        for (var i in ob) {
            if (!ob.hasOwnProperty(i)) continue;
            
            if ((typeof ob[i]) == 'object' && ob[i] != null) {
                var flatObject = flattenObject(ob[i]);
                for (var x in flatObject) {
                    if (!flatObject.hasOwnProperty(x)) continue;
                    
                    toReturn[i + '.' + x] = flatObject[x];
                }
            } else {
                toReturn[i] = ob[i];
            }
        }
        return toReturn;
    };
}
/* ************************************************************************
SINGLETON CLASS DEFINITION
************************************************************************ */
pluginManager.instance = null;
 
/**
 * Singleton getInstance definition
 * @return pluginManager class
 */
pluginManager.getInstance = function(){
    if(this.instance === null){
        this.instance = new pluginManager();
        this.instance.extendModule("pluginManager", this.instance);
    }
    return this.instance;
}
 
module.exports = pluginManager.getInstance();