(function() {
    var TAG = '[AuthInterceptor]';

    function containsAuthData(body) {
        return body.indexOf('"token"') !== -1 ||
               body.indexOf('"uId"') !== -1 ||
               body.indexOf('"shopkeeperId"') !== -1 ||
               body.indexOf('"sessionId"') !== -1;
    }

    var origFetch = window.fetch;
    if (origFetch) {
        window.fetch = function(url, opts) {
            return origFetch.apply(this, arguments).then(function(response) {
                var ct = response.headers.get('content-type') || '';
                if (ct.indexOf('json') !== -1) {
                    var clone = response.clone();
                    clone.text().then(function(body) {
                        if (containsAuthData(body)) {
                            if (window.Android) {
                                window.Android.onAuthData(url.toString(), body);
                            }
                        }
                    });
                }
                return response;
            });
        };
    }

    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._requestUrl = (typeof url === 'string') ? url : (url ? url.toString() : '');
        return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        var xhr = this;
        var onload = xhr.onload;
        xhr.onload = function() {
            if (onload) onload.apply(xhr, arguments);
            var ct = xhr.getResponseHeader('content-type') || '';
            if (ct.indexOf('json') !== -1) {
                try {
                    var text = xhr.responseText;
                    if (containsAuthData(text)) {
                        if (window.Android) {
                            window.Android.onAuthData(xhr._requestUrl || '', text);
                        }
                    }
                } catch(e) {}
            }
        };
        return origSend.apply(this, arguments);
    };
})();
