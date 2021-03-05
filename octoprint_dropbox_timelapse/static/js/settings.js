$(function() {
    // A custom ViewModel for holding custom upload events
    function AdditionalUploadEventViewModel(event_name, payload_path_key){
        var self = this;
        self.event_name = ko.observable(event_name);
        self.payload_path_key = ko.observable(payload_path_key);
    }
    function DropboxTimelapseSettingsViewModel(parameters) {
        var self = this;

        // assign the injected parameters, e.g.:
        // self.loginStateViewModel = parameters[0];
        self.settingsViewModel = parameters[0];
        self.cert_saved = ko.observable(false);
        self.cert_authorized = ko.observable(false);
        self.authorizing = ko.observable(false);
        self.cert_file_name = ko.observable('');
        self.cert_file_data = undefined;
        self.auth_code = ko.observable('');
        self.auth_url = ko.observable('#');
        self.valid_privacy_statuses = ko.observableArray([
          { name : 'Private', value : 'private' },
          { name : 'Unlisted', value : 'unlisted' },
          { name : 'Public', value : 'public' }
        ]);

        var certFileuploadOptions = {
            dataType: "json",
            maxNumberOfFiles: 1,
            autoUpload: false,
            headers: OctoPrint.getRequestHeaders(),
            add: function(e, data) {
                if (data.files.length === 0) {
                    // no files? ignore
                    return false;
                }

                self.cert_file_name(data.files[0].name);
                self.cert_file_data = data;
            },
            done: function(e, data) {
                self.cert_file_name(undefined);
                self.cert_file_data = undefined;
            }
        };

        $("#googledrivebackup_cert_file").fileupload(certFileuploadOptions);

        self.onBeforeBinding = function() {
        self.cert_saved(self.settingsViewModel.settings.plugins.googledrivebackup.cert_saved());
        self.cert_authorized(self.settingsViewModel.settings.plugins.googledrivebackup.cert_authorized());
        }

        self.uploadCertFile = function(){
            if (self.cert_file_data === undefined) return;
            self.authorizing(true);
            var input, file, fr;

            if (typeof window.FileReader !== 'function') {
              alert("The file API isn't supported on this browser yet.");
              self.authorizing(false);
              return;
            }

            file = self.cert_file_data.files[0];
            fr = new FileReader();
            fr.onload = receivedText;
            fr.readAsText(file);

            function receivedText(e) {
                let lines = e.target.result;
                var json_data = JSON.parse(lines);
                $.ajax({
                    url: API_BASEURL + "plugin/dropbox_timelapse",
                    type: "POST",
                    dataType: "json",
                    data: JSON.stringify({command: "gen_secret", json_data: json_data}),
                    contentType: "application/json; charset=UTF-8"
                }).done(function(data){
                    if(data.cert_saved){
                        self.cert_saved(true);
                        self.auth_url(data.url);
                        self.authorizing(false);
                    }
                }).fail(function(data){
                    console.log("error uploading cert file");
                    self.authorizing(false);
                });
            }
        }

        self.authorizeCertFile = function(){
            if(self.auth_code() === '') return;
            self.authorizing(true);
            $.ajax({
                url: API_BASEURL + "plugin/dropbox_timelapse",
                type: "POST",
                dataType: "json",
                data: JSON.stringify({command: "authorize", auth_code: self.auth_code()}),
                contentType: "application/json; charset=UTF-8"
            }).done(function(data){
                if(data.authorized){
                    self.cert_authorized(true);
                    self.authorizing(false);
                }
            }).fail(function(data){
                console.log("error authorizing");
                self.cert_authorized(false);
                self.authorizing(false);
            });
        }

        self.deleteCertFiles = function(){
            self.cert_saved(false);
        self.cert_authorized(false);
        }




        self.settings = parameters[0];
        self.plugin_settings = null;

        self.onBeforeBinding = function() {
            // Make plugin setting access a little more terse
            self.plugin_settings = self.settings.settings.plugins.dropbox_timelapse;
        };
        // Add a custom event
        self.addUploadEvent = function() {
            self.plugin_settings.additional_upload_events.push(
                new AdditionalUploadEventViewModel("","")
            );
        };
        // Remove a custom event
        self.removeUploadEvent = function(index) {
            self.plugin_settings.additional_upload_events.splice(index, 1);
        };

        self.Popups = {};

        // Listen for plugin messages
        // This could probably be made a bit simpler.
        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin !== "dropbox_timelapse") {
                return;
            }
            switch (data.type) {
                case 'upload-start':
                {
                    var popup_options= {
                        title: 'Uploading to Dropbox...',
                        text: '\'' + data.file_name + '\' is uploading to dropbox now.',
                        type: 'info',
                        hide: true,
                        desktop: {
                            desktop: true
                        }
                    };
                    // Show at most one of these at a time.
                    self.displayPopupForKey(popup_options,data.type, [data.type]);
                    break;
                }
                case 'upload-success':
                {
                    var popup_options= {
                        title: 'Dropbox upload complete!',
                        text: '\'' + data.file_name + '\' was uploaded to Dropbox successfully!.',
                        type: 'success',
                        hide: false,
                        desktop: {
                            desktop: true
                        }
                    };
                     self.displayPopup(popup_options);
                     // Close the upload-start popup if it hasn't closed already to keep things clean
                     self.closePopupsForKeys('upload-start');
                    break;
                }
                case 'upload-failed':
                {
                    var popup_options= {
                        title: 'Droopbox upload failed!',
                        text: '\'' + data.file_name + '\' failed to upload to Dropbox!  Please check plugin_dropbox_timelapse.log for more details.',
                        type: 'error',
                        hide: false,
                        desktop: {
                            desktop: true
                        }
                    };
                     self.displayPopup(popup_options);
                     // Close the upload-start popup if it hasn't closed already to keep things clean
                     self.closePopupsForKeys('upload-start');
                    break;
                }
                case 'delete-failed':
                {
                    var popup_options= {
                        title: 'Delete After Dropbox Upload failed!',
                        text: '\'' + data.file_name + '\' could not be deleted.  Please check plugin_dropbox_timelapse.log for more details.',
                        type: 'error',
                        hide: false,
                        desktop: {
                            desktop: true
                        }
                    };
                     self.displayPopup(popup_options);
                     // No need to close the upload-start popup if it hasn't closed already here, since the success/fail
                    // popup will take care of that!
                    break;
                }
                defalut:
                    console.error("dropbox_timelapse - An unknown plugin message type of " + data.type + "was received.");
                    break;
            }
        };

        self.displayPopup = function(options)
        {
            options.width = '450px';
            new PNotify(options);
        };

        // Show at most one popup for a given key, close any popups with the keys provided.
        self.displayPopupForKey = function (options, popup_key, remove_keys) {
            self.closePopupsForKeys(remove_keys);
            options.width = '450px';
            var popup = new PNotify(options);
            self.Popups[popup_key] = popup;
            return popup;
        };

        self.closePopupsForKeys = function (remove_keys) {
            if (!$.isArray(remove_keys)) {
                remove_keys = [remove_keys];
            }
            for (var index = 0; index < remove_keys.length; index++) {
                var key = remove_keys[index];
                if (key in self.Popups) {
                    var notice = self.Popups[key];
                    if (notice.state === "opening") {
                        notice.options.animation = "none";
                    }
                    notice.remove();
                    delete self.Popups[key];
                }
            }
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        DropboxTimelapseSettingsViewModel,
        ["settingsViewModel"],
        ["#dropbox_timelapse_settings"]
    ]);
});
