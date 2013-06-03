/**
 * The "server" portion of the chrome extension, which listens to events
 * from other clients such as the popup or per-page content windows.
 */
Asana.ExtensionServer = {

  /**
   * Call from the background page: listen to chrome events and
   * requests from page clients, which can't make cross-domain requests.
   */
  listen: function() {
    Asana.ApiBridge.is_server = true;
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      if (request.type === "api") {
        // Request to the API. Pass it on to the bridge.
        Asana.ApiBridge.request(
            request.method, request.path, request.params, sendResponse,
            request.options || {});
        return true;  // will call sendResponse asynchronously
      } else if (request.type === "quick_add") {

        // QuickAdd request, made from a content window.
        // Open up a new popup, and set the request information on its window
        // (see popup.html for how it's used)
        var popup = window.open(
            chrome.extension.getURL('popup.html') + '?external=true',
            "asana_quick_add",
            "dependent=1,resizable=0,location=0,menubar=0,status=0,toolbar=0,width=410,height=310,top=100,left=100");
        popup.quick_add_request = request;
        // Quick Add should only come from a content script, so it must have
        // a `tab`.
        popup.quick_add_request.favicon_url = sender.tab.favIconUrl;
      }
    });
  }

};
