// Restricted child process. Original SDK globals live for the lifetime of this process.
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
let context,
  pending,
  active,
  callbacks = 0,
  blocked = 0;
const timers = new Map();
const unsupported = new Set();
const missing = new Set();
const networkKinds = new Map();
const blockedPaths = new Set();
const blockedSdkHosts = new Set();
const responseReads = new Set();
const scriptResources = new Set();
const eventListeners = new Set();
const loadedSources = new Set();
const loadedResourceUrls = new Set();
const reusedScriptResources = new Set();
const tokenWrites = { msToken: 0, xmst: 0 };
const auxiliary = new Map();
let auxiliaryId = 0;
let lastFailure;
function failureSummary(error) {
  return {
    name: ['TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'Error'].includes(
      error?.name,
    )
      ? error.name
      : 'Error',
    locations: [
      ...String(error?.stack ?? '').matchAll(
        /(?:sdk-(?:dynamic-)?\d+\.js|tiktok-sdk-worker\.mjs):\d+:\d+/g,
      ),
    ]
      .slice(0, 8)
      .map((m) => m[0]),
  };
}
function sdkEndpoint(target, method) {
  return (
    !target.username &&
    !target.password &&
    !target.hash &&
    ['https://mssdk.tiktokw.us', 'https://mssdk-va.tiktok.com'].includes(target.origin) &&
    ((method === 'POST' && target.pathname === '/web/report') ||
      (method === 'GET' && target.pathname === '/web/resource'))
  );
}
function networkKind(url, method, transport) {
  let category = 'other';
  try {
    const target = new URL(url);
    if (/^mssdk(?:-[a-z]+)?\.(?:tiktok\.com|tiktokw\.us)$/.test(target.hostname))
      blockedSdkHosts.add(target.hostname);
    // Only short static endpoint paths; never query strings or arbitrary hosts.
    if (/^\/[a-zA-Z_/-]{1,100}$/.test(target.pathname)) blockedPaths.add(target.pathname);
    if (/^\/web\/(report|common|sdk)/.test(target.pathname)) category = 'sdk-report';
    else if (target.pathname.startsWith('/api/comment/')) category = 'comments';
    else if (target.pathname.startsWith('/api/search/')) category = 'search';
  } catch {
    /* Keep unknown URLs private. */
  }
  const key = `${transport}:${method === 'POST' ? 'POST' : method === 'GET' ? 'GET' : 'other'}:${category}`;
  networkKinds.set(key, (networkKinds.get(key) ?? 0) + 1);
}
let timerId = 0;
const run = (source) => vm.runInContext(source, context, { timeout: 1500 });
const bounded = (promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('SDK_TIMEOUT')), 2000);
      timer.unref();
    }),
  ]);
process.on('unhandledRejection', () => unsupported.add('unhandled-rejection'));
function timer(callback, delay, repeat, args) {
  if (timers.size >= 100 || callbacks >= 200) {
    unsupported.add('timer-budget');
    return 0;
  }
  const id = ++timerId;
  const fire = () => {
    if (++callbacks > 200) {
      stop(id);
      unsupported.add('timer-budget');
      return;
    }
    if (!repeat) timers.delete(id);
    context.__callback = callback;
    context.__args = args;
    try {
      run("typeof __callback === 'function' ? __callback(...__args) : eval(String(__callback))");
    } catch (error) {
      lastFailure = failureSummary(error);
      unsupported.add('timer-callback-error');
    } finally {
      delete context.__callback;
      delete context.__args;
    }
  };
  const handle = (repeat ? setInterval : setTimeout)(
    fire,
    Math.max(1, Math.min(Number(delay) || 0, 2147483647)),
  );
  handle.unref();
  timers.set(id, handle);
  return id;
}
function stop(id) {
  clearTimeout(timers.get(id));
  clearInterval(timers.get(id));
  timers.delete(id);
}
function headerMsToken(headers) {
  if (!headers || typeof headers !== 'object') return;
  for (const [name, value] of Object.entries(headers)) {
    if (String(name).toLowerCase() !== 'x-ms-token' || typeof value !== 'string') continue;
    if (value && value.length <= 4096 && !/[\r\n;]/.test(value)) return value;
  }
}
function applyMsTokenFromHeaders(headers) {
  // Native SDK reads x-ms-token but, in this VM, often leaves localStorage/xmst stale.
  // Keep query token, companion token and JS-visible cookie aligned for the next sign.
  const token = headerMsToken(headers);
  if (!token || !context) return;
  context.__token = token;
  try {
    run(`(() => {
      const token = __token;
      if (localStorage.getItem('msToken') !== token) localStorage.setItem('msToken', token);
      if (localStorage.getItem('xmst') !== token) localStorage.setItem('xmst', token);
      const current = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('msToken='));
      if (!current || current.slice(8) !== token) document.cookie = 'msToken=' + token;
    })()`);
  } catch {
    unsupported.add('token-sync-failed');
  } finally {
    delete context.__token;
  }
}
function diagnostics() {
  return {
    missing: [...missing],
    unsupported: [...unsupported],
    blockedNetworkRequests: blocked,
    timerCallbacks: callbacks,
    blockedNetworkKinds: Object.fromEntries(networkKinds),
    blockedPaths: [...blockedPaths],
    blockedSdkHosts: [...blockedSdkHosts],
    pendingSdkRequests: auxiliary.size,
    lastFailure,
    responseReads: [...responseReads],
    scriptResources: [...scriptResources],
    reusedScriptResources: [...reusedScriptResources],
    eventListeners: [...eventListeners],
    tokenWrites: { ...tokenWrites },
    tokenState: JSON.parse(
      run(
        "JSON.stringify({present:!!localStorage.getItem('msToken'),length:(localStorage.getItem('msToken')||'').length,hasCompanionToken:!!localStorage.getItem('xmst')})",
      ),
    ),
    cookieTokenState: JSON.parse(
      run(
        "JSON.stringify({present:document.cookie.split(';').some(x=>x.trim().startsWith('msToken=')),matchesStorage:document.cookie.split(';').some(x=>x.trim()==='msToken='+localStorage.getItem('msToken'))})",
      ),
    ),
    storage: JSON.parse(
      run('JSON.stringify({local:localStorage.length,session:sessionStorage.length})'),
    ),
  };
}
async function boot(input) {
  if (context) throw new Error('SDK_ALREADY_INITIALIZED');
  process.env.TZ = input.environment.timezone;
  const origin = Date.now(),
    base = input.state.performanceNow + Math.max(0, origin - Date.parse(input.state.capturedAt));
  const monotonicOrigin = performance.now();
  context = vm.createContext({
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    atob,
    btoa,
    Request,
    Response,
    Headers,
    Event,
    EventTarget,
    CustomEvent,
    crypto,
    __input: input,
    __missing(name) {
      if (missing.size < 100 && /^[\w.:-]{1,100}$/.test(name)) missing.add(name);
    },
    __unsupported(name) {
      unsupported.add(name);
    },
    __listener(scope, name) {
      const known = [
        'beforeunload',
        'error',
        'unhandledrejection',
        'keydown',
        'keyup',
        'keypress',
        'mousedown',
        'mouseup',
        'mousemove',
        'click',
        'dblclick',
        'wheel',
        'paste',
        'touchstart',
        'touchend',
        'touchmove',
        'scroll',
        'resize',
        'devicemotion',
        'unload',
        'pagehide',
        'visibilitychange',
        'pageshow',
        'hashchange',
        'load',
        'DOMContentLoaded',
      ];
      if (eventListeners.size < 50)
        eventListeners.add(scope + ':' + (known.includes(name) ? name : 'other'));
    },
    __elementAppend(node) {
      if (node.tagName !== 'SCRIPT' || !node.src) return;
      try {
        const url = new URL(node.src, context.location.href);
        if (
          /^[a-z0-9.-]+\.(?:tiktok\.com|tiktokw\.us|tiktokcdn-us\.com|tiktokcdn\.com)$/.test(
            url.hostname,
          )
        )
          scriptResources.add(
            url.origin +
              (/^\/[a-zA-Z0-9_./-]{1,200}$/.test(url.pathname) ? url.pathname : '/other'),
          );
        if (
          url.href ===
          'https://lf16-tiktok-web.tiktokcdn-us.com/obj/tiktok-web-tx/webmssdk_ex/2.0.0.1667/webmssdk_ex.js'
        ) {
          // A manifest URL identifies an already hash-verified, executed source.
          // Preserve the loader callback without downloading or wrapping it twice.
          if (loadedResourceUrls.has(url.href)) {
            reusedScriptResources.add(url.href);
            timer(() => node.onload?.(new Event('load')), 1, false, []);
            return;
          }
          if (auxiliaryId >= 4) return;
          auxiliary.set(++auxiliaryId, {
            id: auxiliaryId,
            url: url.href,
            method: 'GET',
            headers: {},
            body: null,
            script: node,
          });
        }
      } catch {}
    },
    __storageWrite(key) {
      if (Object.hasOwn(tokenWrites, key)) tokenWrites[key]++;
    },
    __xhrSend(xhr, method, url, headers, body) {
      let target;
      try {
        target = new URL(url, context.location.href);
      } catch {}
      if (
        !target ||
        !sdkEndpoint(target, method) ||
        auxiliaryId >= 4 ||
        (body != null && (typeof body !== 'string' || body.length > 128 * 1024))
      ) {
        blocked++;
        networkKind(url, method, 'xhr');
        timer(() => xhr.__complete(0, '', {}, ''), 1, false, []);
        return;
      }
      auxiliary.set(++auxiliaryId, {
        id: auxiliaryId,
        url: target.toString(),
        method,
        headers,
        body,
        xhr,
      });
    },
    __blockedXhr(method, url) {
      blocked++;
      networkKind(url, method, 'xhr');
    },
    __now() {
      return base + performance.now() - monotonicOrigin;
    },
    setTimeout: (fn, ms, ...args) => timer(fn, ms, false, args),
    setInterval: (fn, ms, ...args) => timer(fn, ms, true, args),
    clearTimeout: stop,
    clearInterval: stop,
    fetch(input, options) {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const method = options?.method ?? input?.method ?? 'GET';
      if (
        !pending ||
        url.origin !== pending.origin ||
        url.pathname !== pending.path ||
        method !== 'GET'
      ) {
        const body = options?.body ?? null;
        if (
          sdkEndpoint(url, method) &&
          auxiliaryId < 4 &&
          (body === null || (typeof body === 'string' && body.length <= 128 * 1024))
        ) {
          return new Promise((resolve) =>
            auxiliary.set(++auxiliaryId, {
              id: auxiliaryId,
              url: url.toString(),
              method,
              headers: Object.fromEntries(new Headers(options?.headers)),
              body,
              resolve,
            }),
          );
        }
        blocked++;
        networkKind(url.toString(), method, 'fetch');
        return Promise.reject(new Error('SDK_NETWORK_BLOCKED'));
      }
      const slot = pending;
      pending = undefined;
      active.url = url.toString();
      slot.capture(url.toString());
      return new Promise((resolve, reject) => {
        active.resolve = resolve;
        active.reject = reject;
      });
    },
  });
  run(`
    globalThis.window=globalThis;globalThis.self=globalThis;globalThis.top=globalThis;globalThis.parent=globalThis;
    const snapshot=__input.state, env=__input.environment;
    const observed=(name,value)=>new Proxy(value,{get(target,key){if(key in target)return target[key];if(typeof key==='string')__missing(name+'.'+key);return undefined;}});
    globalThis.navigator=observed('navigator',{...env.navigator,onLine:true});
    if(navigator.userAgentData){navigator.userAgentData.getHighEntropyValues=async(keys)=>Object.fromEntries(keys.filter(k=>k in (navigator.userAgentData.highEntropy??{})).map(k=>[k,navigator.userAgentData.highEntropy[k]]));}
    globalThis.location=new URL(snapshot.url);
    globalThis.screen={...env.screen,pixelDepth:env.screen.colorDepth};globalThis.devicePixelRatio=env.screen.pixelRatio;
    globalThis.performance={timeOrigin:snapshot.timeOrigin,now:__now};
    globalThis.localStorage=makeStorage('local',snapshot.localStorage);globalThis.sessionStorage=makeStorage('session',snapshot.sessionStorage);
    function makeStorage(area,initial){
      const data=new Map(Object.entries(initial));
      const omitted=new Set(snapshot.omittedStorage.filter(x=>x.area===area).map(x=>x.key));
      function get(key){if(omitted.has(String(key)))__unsupported('uncaptured-storage-read');return data.get(String(key))??null;}
      const api={getItem:get,setItem(k,v){__storageWrite(String(k));data.set(String(k),String(v));},removeItem(k){__storageWrite(String(k));data.delete(String(k));},clear(){data.clear();},key(i){return [...data.keys()][i]??null;},get length(){return data.size;}};
      return new Proxy(api,{get(t,k){return k in t?Reflect.get(t,k):get(k)??undefined;},set(t,k,v){api.setItem(k,v);return true;},deleteProperty(t,k){api.removeItem(k);return true;}});
    }
    const cookies=new Map(snapshot.documentCookie.split(';').filter(Boolean).map(c=>{const i=c.indexOf('=');return [c.slice(0,i).trim(),c.slice(i+1)];}));
    globalThis.__replaceDocumentCookies=value=>{cookies.clear();for(const c of value.split(';').filter(Boolean)){const i=c.indexOf('=');if(i>0)cookies.set(c.slice(0,i).trim(),c.slice(i+1));}};
    const docEvents=new EventTarget(),winEvents=new EventTarget();
    const appendChild=node=>{__elementAppend(node);__unsupported('append-element:'+String(node.tagName??'unknown').toLowerCase());if(node.text||node.textContent||node.innerHTML)__unsupported('element-inline-content');if(node.src)__unsupported('element-src');return node;};
    globalThis.addEventListener=(name,...args)=>{__listener('window',name);winEvents.addEventListener(name,...args);};globalThis.removeEventListener=winEvents.removeEventListener.bind(winEvents);globalThis.dispatchEvent=winEvents.dispatchEvent.bind(winEvents);
    globalThis.document=observed('document',{
      get cookie(){return [...cookies].map(([k,v])=>k+'='+v).join('; ');},
      set cookie(value){const pair=String(value).split(';')[0],i=pair.indexOf('=');if(i>0)cookies.set(pair.slice(0,i).trim(),pair.slice(i+1));__unsupported('cookie-attributes-not-emulated');},
      referrer:snapshot.referrer,URL:snapshot.url,visibilityState:snapshot.visibilityState,readyState:snapshot.readyState,documentElement:{appendChild},head:{appendChild},body:{appendChild},
      addEventListener(name,...args){__listener('document',name);docEvents.addEventListener(name,...args);},removeEventListener:docEvents.removeEventListener.bind(docEvents),dispatchEvent:docEvents.dispatchEvent.bind(docEvents),
      createEvent(type){const e=new Event(type);e.initEvent=(type,bubbles,cancelable)=>Object.defineProperties(e,{type:{value:type},bubbles:{value:bubbles},cancelable:{value:cancelable}});return e;},
      createElement(tag){
        const node={tagName:String(tag).toUpperCase(),appendChild,style:{},getContext(){__unsupported('canvas');return null;},setAttribute(){__unsupported('element-attributes');},getAttribute(){return null;}};
        if(String(tag).toLowerCase()==='a'){
          let link=new URL(snapshot.url);
          for(const key of ['href','protocol','host','hostname','port','pathname','search','hash','origin'])Object.defineProperty(node,key,{enumerable:true,configurable:true,get(){return link[key];},set(value){if(key==='href')link=new URL(String(value),snapshot.url);else if(key!=='origin')link[key]=String(value);}});
          node.toString=()=>link.href;
        }
        return observed('element:'+tag,node);
      },
      querySelector(){__unsupported('dom-query');return null;},getElementsByTagName(){__unsupported('dom-query');return [];}
    });
    const xhrState=new WeakMap();
    globalThis.XMLHttpRequest=class extends EventTarget {
      constructor(){super();xhrState.set(this,{readyState:0,status:0,statusText:'',responseURL:'',responseText:'',response:''});}
      static UNSENT=0;static OPENED=1;static HEADERS_RECEIVED=2;static LOADING=3;static DONE=4;
      UNSENT=0;OPENED=1;HEADERS_RECEIVED=2;LOADING=3;DONE=4;
      responseType='';timeout=0;withCredentials=false;upload=new EventTarget();
      open(method,url){this.__method=String(method).toUpperCase();this.__url=String(url);this.__headers={};xhrState.get(this).readyState=1;this.__event('readystatechange');}
      setRequestHeader(name,value){this.__headers[String(name).toLowerCase()]=String(value);}
      send(body=null){__xhrSend(this,this.__method,this.__url,this.__headers,body);}
      getResponseHeader(name){return this.__responseHeaders?.[String(name).toLowerCase()]??null;}
      getAllResponseHeaders(){return Object.entries(this.__responseHeaders??{}).map(([k,v])=>k+': '+v).join('\\r\\n');}
      abort(){this.__complete(0,'',{},'');}
      overrideMimeType(){}
      __event(name){const event=new Event(name);this.dispatchEvent(event);if(typeof this['on'+name]==='function')this['on'+name](event);}
      __complete(status,text,headers,url){Object.assign(xhrState.get(this),{status,responseURL:url,responseText:text,response:this.responseType==='json'?JSON.parse(text||'null'):text,readyState:4});this.__responseHeaders=headers;this.__event('readystatechange');this.__event(status?'load':'error');this.__event('loadend');}
    };
    const xhrHandlers=new WeakMap();
    for(const name of ['onreadystatechange','onload','onerror','onloadend','onloadstart','onabort','ontimeout','onprogress'])Object.defineProperty(XMLHttpRequest.prototype,name,{configurable:true,enumerable:true,get(){return xhrHandlers.get(this)?.[name]??null;},set(value){const handlers=xhrHandlers.get(this)??{};handlers[name]=value;xhrHandlers.set(this,handlers);}});
    for(const name of ['status','readyState','statusText','responseURL','responseText','response'])Object.defineProperty(XMLHttpRequest.prototype,name,{configurable:true,enumerable:true,get(){return xhrState.get(this)[name];}});
    globalThis.console={log(){},debug(){},error(){},warn(){},info(){},trace(){}};
    globalThis.__bootstrap=snapshot.bootstrap;
  `);
  for (let i = 0; i < input.sources.length; i++) {
    try {
      new vm.Script(input.sources[i], { filename: 'sdk-' + i + '.js' }).runInContext(context, {
        timeout: 1500,
      });
      loadedSources.add(createHash('sha256').update(input.sources[i]).digest('hex'));
      if (input.resourceUrls?.[i]) loadedResourceUrls.add(input.resourceUrls[i]);
    } catch {
      throw new Error('SDK_SOURCE_LOAD_FAILED');
    }
  }
  context.__init = input.initConfigs;
  try {
    run('for(const config of __init)byted_acrawler.init(config)');
  } catch {
    throw new Error('SDK_INIT_FAILED');
  }
  delete context.__init;
  delete context.__input;
  // Imported snapshots can still be in "loading". A new SDK instance must see
  // this document finish loading; otherwise its deferred bootstrap never runs.
  run(
    "document.readyState='interactive';document.dispatchEvent(new Event('readystatechange'));document.dispatchEvent(new Event('DOMContentLoaded'));document.readyState='complete';document.dispatchEvent(new Event('readystatechange'));dispatchEvent(new Event('load'));if(typeof onload==='function')onload(new Event('load'))",
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  return diagnostics();
}
async function command(input) {
  if (input.action === 'boot') return boot(input);
  if (!context) throw new Error('SDK_NOT_INITIALIZED');
  if (input.action === 'sign') {
    if (active) throw new Error('SDK_RESPONSE_REQUIRED');
    const target = new URL(input.url);
    const captured = new Promise((resolve) => {
      pending = { origin: target.origin, path: target.pathname, capture: resolve };
    });
    active = {};
    context.__target = input.url;
    try {
      active.promise = run("fetch(__target,{method:'GET',credentials:'include'})");
      active.promise?.catch(() => {});
      const url = await bounded(captured);
      const signedToken = new URL(url).searchParams.get('msToken');
      const state = diagnostics();
      state.signedTokenMatchesStorage = signedToken === run("localStorage.getItem('msToken')");
      state.signedTokenMatchesCompanion = signedToken === run("localStorage.getItem('xmst')");
      return { url, diagnostics: state };
    } catch {
      throw new Error('SDK_SIGN_FAILED');
    } finally {
      delete context.__target;
    }
  }
  if (input.action === 'response') {
    if (!active?.resolve) throw new Error('SDK_REQUEST_REQUIRED');
    if (typeof input.documentCookie === 'string') {
      context.__cookieFeedback = input.documentCookie;
      run('__replaceDocumentCookies(__cookieFeedback)');
      delete context.__cookieFeedback;
    }
    const response = new Response([101, 204, 205, 304].includes(input.status) ? null : input.text, {
      status: input.status,
      headers: input.headers ?? {},
    });
    // Response() has an empty URL. The native SDK gates response-token handling
    // on the request URL, so feedback must retain the private signed target.
    const responseUrl = active.url;
    const withUrl = (value) => {
      Object.defineProperty(value, 'url', { value: responseUrl });
      const clone = value.clone.bind(value);
      value.clone = () => withUrl(clone());
      return value;
    };
    withUrl(response);
    const headers = new Proxy(response.headers, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (key === 'get')
          return (name) => {
            responseReads.add(
              String(name).toLowerCase() === 'x-ms-token' ? 'headers:x-ms-token' : 'headers:other',
            );
            return target.get(name);
          };
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    active.resolve(
      new Proxy(response, {
        get(target, key) {
          if (['url', 'status', 'headers', 'type', 'ok'].includes(key)) responseReads.add(key);
          if (key === 'headers') return headers;
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    );
    try {
      await bounded(active.promise);
    } catch {
      applyMsTokenFromHeaders(input.headers);
      throw new Error('SDK_RESPONSE_FAILED');
    }
    applyMsTokenFromHeaders(input.headers);
    active = undefined;
    return diagnostics();
  }
  if (input.action === 'request-failed') {
    if (!active?.reject) throw new Error('SDK_REQUEST_REQUIRED');
    active.reject(new TypeError('Network request failed'));
    try {
      await bounded(active.promise);
    } catch {
      // A rejected fetch is expected here. Retain SDK storage for the retry.
    } finally {
      active = undefined;
    }
    return diagnostics();
  }
  if (input.action === 'auxiliary') {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return [...auxiliary.values()].map(
      ({ xhr: _xhr, resolve: _resolve, script: _script, ...request }) => request,
    );
  }
  if (input.action === 'auxiliary-response') {
    const request = auxiliary.get(input.id);
    if (!request) throw new Error('SDK_AUXILIARY_MISSING');
    auxiliary.delete(input.id);
    if (request.script) {
      if (input.status !== 200) throw new Error('SDK_SCRIPT_HTTP_FAILED');
      const hash = createHash('sha256').update(input.text).digest('hex');
      // Older manifests already include the extension. Re-executing it would
      // wrap fetch/XHR a second time in the same SDK session.
      if (!loadedSources.has(hash)) {
        new vm.Script(input.text, { filename: 'sdk-dynamic-' + input.id + '.js' }).runInContext(
          context,
          { timeout: 1500 },
        );
        loadedSources.add(hash);
      }
      context.__loadedScript = request.script;
      try {
        run(
          "if(typeof __loadedScript.onload==='function')__loadedScript.onload(new Event('load'))",
        );
      } finally {
        delete context.__loadedScript;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      return diagnostics();
    }
    if (request.resolve) {
      const response = new Response(input.text, { status: input.status, headers: input.headers });
      Object.defineProperty(response, 'url', { value: request.url });
      request.resolve(response);
      await new Promise((resolve) => setTimeout(resolve, 50));
      applyMsTokenFromHeaders(input.headers);
      return diagnostics();
    }
    context.__xhrFeedback = {
      xhr: request.xhr,
      url: request.url,
      status: input.status,
      text: input.text,
      headers: input.headers,
    };
    try {
      run(
        '__xhrFeedback.xhr.__complete(__xhrFeedback.status,__xhrFeedback.text,__xhrFeedback.headers,__xhrFeedback.url)',
      );
    } finally {
      delete context.__xhrFeedback;
    }
    applyMsTokenFromHeaders(input.headers);
    return diagnostics();
  }
  throw new Error('SDK_UNKNOWN_COMMAND');
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (Buffer.byteLength(line) > 8 * 1024 * 1024) process.exit(2);
  let response;
  try {
    response = { ok: true, result: await command(JSON.parse(line)) };
  } catch (error) {
    lastFailure = failureSummary(error);
    response = {
      ok: false,
      error: /^SDK_[A-Z_]+$/.test(error.message) ? error.message : 'SDK_WORKER_FAILED',
      diagnostics: context ? diagnostics() : null,
    };
  }
  process.stdout.write(JSON.stringify(response) + '\n');
}
for (const id of timers.keys()) stop(id);
