/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {FetchResponse, assertSuccess, getViewerInterceptResponse, setupAMPCors, setupInit, setupInput, verifyAmpCORSHeaders} from './utils/xhr-utils';
import {Services} from './services';
import {user} from './log';

/**
 *
 *
 * @param {!Window} win
 * @param {string} input
 * @param {?./utils/xhr-utils.FetchInitDef=} opt_init
 * @return {!Promise<!Document>}
 * @ignore
 */
export function fetchDocument(win, input, opt_init) {
  let init = setupInit(opt_init, 'text/html');
  init = setupAMPCors(win, input, init);
  input = setupInput(win, input, init);
  const ampdocService = Services.ampdocServiceFor(win);
  const ampdocSingle =
  ampdocService.isSingleDoc() ? ampdocService.getAmpDoc() : null;
  init.responseType = 'document';
  return getViewerInterceptResponse(win, ampdocSingle, input, init)
      .then(interceptorResponse => {
        if (interceptorResponse) {
          return interceptorResponse.text().then(body =>
            new DOMParser().parseFromString(body, 'text/html')
          );
        }
        return xhrRequest(input, init).then(({xhr, response}) => {
          verifyAmpCORSHeaders(win, response, init);
          return xhr.responseXML;
        });
      });
}

/**
 *
 *
 * @param {string} input
 * @param {!./utils/xhr-utils.FetchInitDef} init
 * @private
 */
function xhrRequest(input, init) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method || 'GET', input, true);
    xhr.withCredentials = (init.credentials == 'include');
    xhr.responseType = 'document';
    // Incoming headers are in fetch format,
    // so we need to convert them into xhr.
    for (const header in init.headers) {
      xhr.setRequestHeader(header, init.headers[header]);
    }

    xhr.onreadystatechange = () => {
      if (xhr.readyState < /* STATUS_RECEIVED */ 2) {
        return;
      }
      if (xhr.status < 100 || xhr.status > 599) {
        xhr.onreadystatechange = null;
        reject(user().createExpectedError(
            `Unknown HTTP status ${xhr.status}`));
        return;
      }
      // TODO(dvoytenko): This is currently simplified: we will wait for the
      // whole document loading to complete. This is fine for the use cases
      // we have now, but may need to be reimplemented later.
      if (xhr.readyState == /* COMPLETE */ 4) {
        const response = new FetchResponse(xhr);
        const promise = assertSuccess(response)
            .then(response => ({response, xhr}));
        resolve(promise);
      }
    };
    xhr.onerror = () => {
      reject(user().createExpectedError('Request failure'));
    };
    xhr.onabort = () => {
      reject(user().createExpectedError('Request aborted'));
    };
    if (init.method == 'POST') {
      xhr.send(/** @type {!FormData} */ (init.body));
    } else {
      xhr.send();
    }
  });
}