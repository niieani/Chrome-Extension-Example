/**
 * Functionality to communicate with the Asana API. This should get loaded
 * in the "server" portion of the chrome extension because it will make
 * HTTP requests and needs cross-domain privileges.
 *
 * The bridge does not need to use an auth token to connect to
 * the API. Since it is a browser extension it can access the user's cookies
 * and can use them to authenticate to the API. This capability is specific
 * to browser extensions, and other types of applications would have to obtain
 * an auth token to communicate with the API.
 */
Asana.ApiBridge = {

  /**
   * @type {String} Version of the Asana API to use.
   */
  API_VERSION: "1.0",

  /**
   * @type {Integer} How long an entry stays in the cache.
   */
  CACHE_TTL_MS: 15 * 60 * 1000,

  /**
   * @type {Boolean} Set to true on the server (background page), which will
   *     actually make the API requests. Clients will just talk to the API
   *     through the ExtensionServer.
   *
   */
  is_server: false,

  /**
   * @type {dict} Map from API path to cache entry for recent GET requests.
   *     date {Date} When cache entry was last refreshed
   *     response {*} Cached request.
   */
  _cache: {},

  /**
   * @param opt_options {dict} Options to use; if unspecified will be loaded.
   * @return {String} The base URL to use for API requests.
   */
  baseApiUrl: function(opt_options) {
    var options = opt_options || Asana.Options.loadOptions();
    return 'https://' + options.asana_host_port + '/api/' + this.API_VERSION;
  },

  /**
   * Make a request to the Asana API.
   *
   * @param http_method {String} HTTP request method to use (e.g. "POST")
   * @param path {String} Path to call.
   * @param params {dict} Parameters for API method; depends on method.
   * @param callback {Function(response: dict)} Callback on completion.
   *     status {Integer} HTTP status code of response.
   *     data {dict} Object representing response of API call, depends on
   *         method. Only available if response was a 200.
   *     error {String?} Error message, if there was a problem.
   * @param options {dict?}
   *     miss_cache {Boolean} Do not check cache before requesting
   */
  request: function(http_method, path, params, callback, options) {
    var me = this;
    http_method = http_method.toUpperCase();

    // If we're not the server page, send a message to it to make the
    // API request.
    if (!me.is_server) {
      console.info("Client API Request", http_method, path, params);
      chrome.runtime.sendMessage({
        type: "api",
        method: http_method,
        path: path,
        params: params,
        options: options || {}
      }, callback);
      return;
    }

    console.info("Server API Request", http_method, path, params);

    // Serve from cache first.
    if (!options.miss_cache && http_method === "GET") {
      var data = me._readCache(path, new Date());
      if (data) {
        console.log("Serving request from cache", path);
        callback(data);
        return;
      }
    }

    // Be polite to Asana API and tell them who we are.
    var manifest = chrome.runtime.getManifest();
    var client_name = [
      "chrome-extension",
      chrome.i18n.getMessage("@@extension_id"),
      manifest.version,
      manifest.name
    ].join(":");

    var url = me.baseApiUrl() + path;
    var body_data;
    if (http_method === "PUT" || http_method === "POST") {
      // POST/PUT request, put params in body
      body_data = {
        data: params,
        options: { client_name: client_name }
      };
    } else {
      // GET/DELETE request, add params as URL parameters.
      var url_params = Asana.update({ opt_client_name: client_name }, params);
      url += "?" + $.param(url_params);
    }

    console.log("Making request to API", http_method, url);

    if (!chrome.cookies) {
          chrome.cookies = chrome.experimental.cookies;
    }

    chrome.cookies.get({
      url: url,
      name: 'ticket'
    }, function(cookie) {
      if (!cookie) {
        callback({
          status: 401,
          error: "Not Authorized"
        });
        return;
      }

      // Note that any URL fetched here must be matched by a permission in
      // the manifest.json file!
      var attrs = {
        type: http_method,
        url: url,
        timeout: 30000,   // 30 second timeout
        headers: {
          "X-Requested-With": "XMLHttpRequest"
        },
        accept: "application/json",
        success: function(data, status, xhr) {
          if (http_method === "GET") {
            me._writeCache(path, data, new Date());
          }
          callback(data);
        },
        error: function(xhr, status, error) {
          // jQuery's ajax() method has some rather funky error-handling.
          // We try to accommodate that and normalize so that all types of
          // errors look the same.
          if (status === "error" && xhr.responseText) {
            var response;
            try {
              response = $.parseJSON(xhr.responseText);
            } catch (e) {
              response = {
                errors: [{message: "Could not parse response from server" }]
              };
            }
            callback(response);
          } else {
            callback({ errors: [{message: error || status }]});
          }
        },
        xhrFields: {
          withCredentials: true
        }
      };
      if (http_method === "POST" || http_method === "PUT") {
          attrs.dataType = "json";
          attrs.processData = false;
          if (!options.upload)
          {
              console.log("processing post/put")
              attrs.data = JSON.stringify(body_data);
              attrs.contentType = "application/json";
          }
          else
          {
              console.log("processing file upload");

              // blob:chrome-extension%3A//[extension id]/[options uuid]
              var blobUrl = params.fileObjectURL;
              console.log(params);
              try {
                  var xhr = new XMLHttpRequest();
                  xhr.open('GET', blobUrl, false);

//                  xhr.open('GET', blobUrl, true);
                  // has to be async because if want arraybuffer
//                  xhr.responseType = 'blob';
//                  xhr.responseType = 'arraybuffer';

//                  xhr.onload = function () {
//
//                  }

                  xhr.send(null);
                  if (xhr.status != 200) {
                      console.log('Failed to load blob:',
                          blobUrl,
                          xhr.status, xhr.statusText);
                  }

                  var blob = new Blob([xhr.response], {type: params.fileType});
                  console.log(blob);
              } catch(e) {
                  console.log(e +
                      '\nFailed to fetch blob... ');
              }


              /*
              var xhr = new XMLHttpRequest();
              xhr.open('GET', params.fileObjectURL, false);
              xhr.responseType = 'blob';
              xhr.send(null);
              console.log("status is " + xhr.status);
              if (xhr.status != 200) {
                  console.log('Failed to load blob:',
                      params.fileObjectURL,
                      xhr.status, xhr.statusText);
              }
//              xhr.response
//              xhr.onload = function()
//              {
*/
              var formData = new FormData();
//              formData.append(params.param, this.response, params.filename);
              formData.append(params.param, blob, params.fileName);

              attrs.data = formData;
              attrs.contentType = false;

//                  console.log(params.fileObjectURL);
//              console.log(this.response);
//              console.log(xhr.response);
                  //console.log(this.responseText);
//              console.log("Will attach (KBs): " + xhr.response.size + " of " + xhr.responseType);
//              console.log("Will attach (KBs): " + this.response.size + " of " + this.response.type);
//              }
//              xhr.send();
              // cleanup
              window.URL.revokeObjectURL(params.fileObjectURL);
          }
      }
      $.ajax(attrs);
    });
  },

  _readCache: function(path, date) {
    var entry = this._cache[path];
    if (entry && entry.date >= date - this.CACHE_TTL_MS) {
      return entry.response;
    }
    return null;
  },

  _writeCache: function(path, response, date) {
    this._cache[path] = {
      response: response,
      date: date
    };
  }
};
