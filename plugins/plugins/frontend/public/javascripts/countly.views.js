window.PluginsView = countlyView.extend({
	initialize:function () {
		this.filter = (store.get("countly_pluginsfilter")) ? store.get("countly_pluginsfilter") : "plugins-all";
    },
    beforeRender: function() {
		if(this.template)
			return $.when(countlyPlugins.initialize()).then(function () {});
		else{
			var self = this;
			return $.when($.get(countlyGlobal["path"]+'/plugins/templates/plugins.html', function(src){
				self.template = Handlebars.compile(src);
			}), countlyPlugins.initialize()).then(function () {});
		}
    },
    renderCommon:function (isRefresh) {
		
        var pluginsData = countlyPlugins.getData();
        this.templateData = {
            "page-title":jQuery.i18n.map["plugins.title"]
        };
		var self = this;
        if (!isRefresh) {
            $(this.el).html(this.template(this.templateData));
			$("#"+this.filter).addClass("selected").addClass("active");
			$.fn.dataTableExt.afnFiltering.push(function( oSettings, aData, iDataIndex ) {
				if(!$(oSettings.nTable).hasClass("plugins-filter"))
					return true;
				if((self.filter == "plugins-enabled" && !aData[3]) || (self.filter == "plugins-disabled" && aData[3])){
					return false
				}
				return true;
			});

			this.dtable = $('#plugins-table').dataTable($.extend({}, $.fn.dataTable.defaults, {
                "aaData": pluginsData,
                "aoColumns": [
                    { "mData": function(row, type){return row.title;}, "sType":"string", "sTitle": jQuery.i18n.map["plugins.name"]},
                    { "mData": function(row, type){return row.description;}, "sType":"string", "sTitle": jQuery.i18n.map["plugins.description"] },
                    { "mData": function(row, type){return row.version;}, "sType":"string", "sTitle": jQuery.i18n.map["plugins.version"], "sClass":"center" },
                    { "mData": function(row, type){if(type == "display"){ if(!row.enabled) return '<a class="icon-button green btn-header btn-plugins" id="plugin-'+row.code+'">'+jQuery.i18n.map["plugins.enable"]+'</a>'; else return '<a class="icon-button red btn-header btn-plugins" id="plugin-'+row.code+'">'+jQuery.i18n.map["plugins.disable"]+'</a>';}else return row.enabled;}, "sType":"string", "sTitle": jQuery.i18n.map["plugins.state"], "sClass":"shrink center"},
					{ "mData": function(row, type){if(row.homepage != "") return '<a class="icon-button btn-header light" href="'+ row.homepage + '" target="_blank">'+jQuery.i18n.map["plugins.homepage"]+'</a>'; else return "";}, "sType":"string", "sTitle": jQuery.i18n.map["plugins.homepage"], "sClass":"shrink center"}
                ]
            }));
			this.dtable.stickyTableHeaders();
			this.dtable.fnSort( [ [0,'asc'] ] );
        }
    },
    refresh:function (){
    },
	togglePlugin: function(plugins){
		var self = this;
		var overlay = $("#overlay").clone();
		$("body").append(overlay);
		overlay.show();
		var loader = $(this.el).find("#content-loader");
		loader.show();
		countlyPlugins.toggle(plugins, function(res){
			var msg = {clearAll:true};
			if(res == "Success" || res == "Errors"){
				var seconds = 10;
				if(res == "Success"){
					msg.title = jQuery.i18n.map["plugins.success"];
					msg.message = jQuery.i18n.map["plugins.restart"]+" "+seconds+" "+jQuery.i18n.map["plugins.seconds"];
					msg.info = jQuery.i18n.map["plugins.finish"];
					msg.delay = seconds*1000;
				}
				else if(res == "Errors"){
					msg.title = jQuery.i18n.map["plugins.errors"];
					msg.message = jQuery.i18n.map["plugins.errors-msg"];
					msg.info = jQuery.i18n.map["plugins.restart"]+" "+seconds+" "+jQuery.i18n.map["plugins.seconds"];
					msg.sticky = true;
					msg.type = "error";
				}
				setTimeout(function(){
					window.location.reload(true);
				}, seconds*1000);
			}
			else{
				overlay.hide();
				loader.hide();
				msg.title = jQuery.i18n.map["plugins.error"];
				msg.message = res;
				msg.info = jQuery.i18n.map["plugins.retry"];
				msg.sticky = true;
				msg.type = "error";
			}
			CountlyHelpers.notify(msg);
		});
	},
	filterPlugins: function(filter){
		this.filter = filter;
		store.set("countly_pluginsfilter", filter);
		$("#"+this.filter).addClass("selected").addClass("active");
		this.dtable.fnDraw();
	}
});

window.ConfigurationsView = countlyView.extend({
	initialize:function () {
		this.predefinedInputs = {};
		this.predefinedLabels = {
            "frontend":"Frontend",
            "api":"API",
            "apps":"Apps",
            "frontend-production":"Production mode",
            "frontend-session_timeout":"Session timeout in ms",
            "api-domain":"Domain in emails",
            "api-safe":"Safer API responses",
            "api-session_duration_limit":"Maximal Session Duration",
            "api-city_data":"Track city data",
            "api-event_limit":"Max unique event keys",
            "api-event_segmentation_limit":"Max segmentation in each event",
            "api-event_segmentation_value_limit":"Max unique values in each segmentation",
            "apps-country":"Default Country",
            "apps-category":"Default Category"
        };
        this.configsData = {};
        this.cache = {};
        this.changes = {};
        
        //register some common system config inputs
        this.registerInput("apps-category", function(value){
            var categories = app.manageAppsView.getAppCategories();
            var select = '<div class="cly-select" id="apps-category">'+
				'<div class="select-inner">'+
					'<div class="text-container">';
            if(!categories[value])
                select += '<div class="text"></div>';
            else
                select += '<div class="text">'+categories[value]+'</div>';
			select += '</div>'+
					'<div class="right combo"></div>'+
				'</div>'+
				'<div class="select-items square">'+
					'<div>';
                    
                for(var i in categories){
                    select += '<div data-value="'+i+'" class="segmentation-option item">'+categories[i]+'</div>';
                }

			select += '</div>'+
				'</div>'+
			'</div>';
            return select;
        });
        
        this.registerInput("apps-country", function(value){
            var zones = app.manageAppsView.getTimeZones();
            var select = '<div class="cly-select" id="apps-country">'+
				'<div class="select-inner">'+
					'<div class="text-container">';
            if(!zones[value])
				select += '<div class="text"></div>';
            else
                select += '<div class="text"><div class="flag" style="background-image:url(images/flags/'+value.toLowerCase()+'.png)"></div>'+zones[value].n+'</div>';
            
			select += '</div>'+
					'<div class="right combo"></div>'+
				'</div>'+
				'<div class="select-items square">'+
					'<div>';
                    
                for(var i in zones){
                    select += '<div data-value="'+i+'" class="segmentation-option item"><div class="flag" style="background-image:url(images/flags/'+i.toLowerCase()+'.png)"></div>'+zones[i].n+'</div>';
                }

			select += '</div>'+
				'</div>'+
			'</div>';
            return select;
        });
        
        this.registerInput("apps-timezone", function(value){
            return null;
        });
    },
    beforeRender: function() {
		if(this.template)
			return $.when(countlyPlugins.initializeConfigs()).then(function () {});
		else{
			var self = this;
			return $.when($.get(countlyGlobal["path"]+'/plugins/templates/configurations.html', function(src){
				self.template = Handlebars.compile(src);
			}), countlyPlugins.initializeConfigs()).then(function () {});
		}
    },
    renderCommon:function (isRefresh) {
        this.configsData = countlyPlugins.getConfigsData();
        var configsHTML = this.generateConfigsTable(this.configsData);
        this.templateData = {
            "page-title":jQuery.i18n.map["plugins.configs"],
            "configs":configsHTML
        };
		var self = this;
        if (!isRefresh) {
            $(this.el).html(this.template(this.templateData));
            this.changes = {};
            this.cache = JSON.parse(JSON.stringify(this.configsData));

			$(".boolean-selector>.button").click(function () {
                var dictionary = {"plugins.enable":true, "plugins.disable":false};
                var cur = $(this);
                if (cur.hasClass("selected")) {
                    return true;
                }
                var prev = cur.parent(".button-selector").find(">.button.selected");
                prev.removeClass("selected").removeClass("active");
                cur.addClass("selected").addClass("active");
                var id = $(this).parent(".button-selector").attr("id");
                var value = dictionary[$(this).data("localize")];
                self.updateConfig(id, value);
            });
            
            $(".configs input").keyup(function () {
                var id = $(this).attr("id");
                var value = $(this).val();
                if($(this).attr("type") == "number")
                    value = parseFloat(value);
                self.updateConfig(id, value);
            });
            
            $(".configs .segmentation-option").on("click", function () {
                var id = $(this).closest(".cly-select").attr("id");
				var value = $(this).data("value");
                self.updateConfig(id, value);
			});
            
            $("#configs-apply-changes").click(function () {
                countlyPlugins.updateConfigs(self.changes, function(err, services){
                    if(err){
                        CountlyHelpers.notify({
                            title: "Configs not changed",
                            message: "Could not save changes",
                            type: "error"
                        });
                    }
                    else{
                        CountlyHelpers.notify({
                            title: "Configs changed",
                            message: "Changes were successfully saved"
                        });
                        self.configsData = JSON.parse(JSON.stringify(self.cache));
                        $("#configs-apply-changes").hide();
                        self.changes = {};
                    }
                });
            });
        }
    },
    updateConfig: function(id, value){
        var configs = id.split("-");
                
        //update cache
        var data = this.cache;
        for(var i = 0; i < configs.length; i++){
            if(typeof data[configs[i]] == "undefined"){
                break;
            }
            else if(i == configs.length-1){
                data[configs[i]] = value;
            }
            else{
                data = data[configs[i]];
            }
        }
        
        //add to changes
        var data = this.changes;
        for(var i = 0; i < configs.length; i++){
            if(i == configs.length-1){
                data[configs[i]] = value;
            }
            else if(typeof data[configs[i]] == "undefined"){
                data[configs[i]] = {};
            }
            data = data[configs[i]];
        }

        if(JSON.stringify(this.configsData) != JSON.stringify(this.cache)){
            $("#configs-apply-changes").show();
        }
        else{
            $("#configs-apply-changes").hide();
            this.changes = {};
        }  
    },
    generateConfigsTable: function(configsData, id){
        id = id || "";
        var first = true;
        if(id != ""){
            first = false;
        }
        var configsHTML = "<table class='d-table help-zone-vb ";
        if(first)
            configsHTML +=  "no-fix";
        configsHTML += "' cellpadding='0' cellspacing='0'>";
        for(var i in configsData){
            if(typeof configsData[i] == "object"){
                if(configsData[i] != null){
                    var label = this.getInputLabel((id+"-"+i).substring(1), i);
                    if(label)
                        configsHTML += "<tr><td>"+label+"</td><td>"+this.generateConfigsTable(configsData[i], id+"-"+i)+"</td></tr>";
                }
            }
            else{
                var input = this.getInputByType((id+"-"+i).substring(1), configsData[i]);
                var label = this.getInputLabel((id+"-"+i).substring(1), i);
                if(input && label)
                    configsHTML += "<tr><td>"+label+"</td><td>"+input+"</td></tr>";
            }
        }
        configsHTML += "</table>";
        return configsHTML;
    },
    getInputLabel: function(id, value){
        if(this.predefinedLabels[id])
            return this.predefinedLabels[id]
        else
            return value;
    },
    getInputByType: function(id, value){
        if(this.predefinedInputs[id]){
            return this.predefinedInputs[id](value);
        }
        else if(typeof value == "boolean"){
            var input = '<div id="'+id+'" class="button-selector boolean-selector">';
            if(value){
                input += '<div class="button active selected" data-localize="plugins.enable"></div>';
                input += '<div class="button" data-localize="plugins.disable"></div>';
            }
            else{
                input += '<div class="button" data-localize="plugins.enable"></div>';
                input += '<div class="button active selected" data-localize="plugins.disable"></div>';
            }
            input += '</div>';
            return input;
        }
        else if(typeof value == "number"){
            return "<input type='number' id='"+id+"' value='"+value+"'/>";
        }
        else
            return "<input type='text' id='"+id+"' value='"+value+"'/>";
    },
    registerInput: function(id, callback){
        this.predefinedInputs[id] = callback;
    },
    refresh:function (){
    }
});

//register views
app.pluginsView = new PluginsView();
app.configurationsView = new ConfigurationsView();
if(countlyGlobal["member"].global_admin){
    app.route('/manage/plugins', 'plugins', function () {
        this.renderWhenReady(this.pluginsView);
    });
    
    app.route('/manage/configurations', 'configurations', function () {
        this.renderWhenReady(this.configurationsView);
    });
}

app.addPageScript("/manage/plugins", function(){
   $("#plugins-selector").find(">.button").click(function () {
        if ($(this).hasClass("selected")) {
            return true;
        }

        $(".plugins-selector").removeClass("selected").removeClass("active");
		var filter = $(this).attr("id");
		app.activeView.filterPlugins(filter);
    });
	var plugins = countlyGlobal["plugins"].slice();
	$("#plugins-table").on("click", ".btn-plugins", function () {
		var show = false;
		var plugin = this.id.toString().replace(/^plugin-/, '');
		if($(this).hasClass("green")){
			$(this).removeClass("green").addClass("red");
			$(this).text(jQuery.i18n.map["plugins.disable"]);
			plugins.push(plugin);
		}
		else if($(this).hasClass("red")){
			$(this).removeClass("red").addClass("green");
			$(this).text(jQuery.i18n.map["plugins.enable"]);
			var index = $.inArray(plugin, plugins);
			plugins.splice(index, 1);
		}
		if(plugins.length != countlyGlobal["plugins"].length)
			show = true;
		else{
			for(var i = 0; i < plugins.length; i++){
				if($.inArray(plugins[i], countlyGlobal["plugins"]) == -1){
					show = true;
					break;
				}
			}
		}
		if(show)
			$(".btn-plugin-enabler").show();
		else
			$(".btn-plugin-enabler").hide();
	});
	$("#plugins-selector").on("click", ".btn-plugin-enabler", function () {
		var plugins = {};
		$(".btn-plugins").each(function(){
			var plugin = this.id.toString().replace(/^plugin-/, '');
			var state = ($(this).hasClass("green")) ? false : true;
			plugins[plugin] = state;
		})
		var text = jQuery.i18n.map["plugins.confirm"];
		var msg = {title:jQuery.i18n.map["plugins.processing"], message: jQuery.i18n.map["plugins.wait"], info:jQuery.i18n.map["plugins.hold-on"], sticky:true};
		CountlyHelpers.confirm(text, "red", function (result) {
			if (!result) {
				return true;
			}
			CountlyHelpers.notify(msg);
			app.activeView.togglePlugin(plugins);
		});
	});
});

app.addPageScript("#", function(){
	if (Backbone.history.fragment == '/manage/plugins') {
        $("#sidebar-app-select").addClass("disabled");
        $("#sidebar-app-select").removeClass("active");
    }
    if (Backbone.history.fragment == '/manage/configurations') {
        $("#sidebar-app-select").addClass("disabled");
        $("#sidebar-app-select").removeClass("active");
    }
});

$( document ).ready(function() {
	if(countlyGlobal["member"] && countlyGlobal["member"]["global_admin"]){
		var menu = '<a href="#/manage/plugins" class="item">'+
			'<div class="logo-icon fa fa-puzzle-piece"></div>'+
			'<div class="text" data-localize="plugins.title"></div>'+
		'</a>';
		if($('#management-submenu .help-toggle').length)
			$('#management-submenu .help-toggle').before(menu);
        
        var menu = '<a href="#/manage/configurations" class="item">'+
			'<div class="logo-icon fa fa-wrench"></div>'+
			'<div class="text" data-localize="plugins.configs"></div>'+
		'</a>';
		if($('#management-submenu .help-toggle').length)
			$('#management-submenu .help-toggle').before(menu);
	}
});