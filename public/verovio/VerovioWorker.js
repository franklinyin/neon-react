/**
 * Dev worker for the currently bundled Verovio WASM prebundle.
 *
 * The prebundle is not synchronously ready after importScripts:
 *   createWasm().then(run) → initRuntime() → Module.onRuntimeInitialized
 * cwrap is attached to the module at parse time and is not a readiness signal.
 */
importScripts('./verovio-toolkit-wasm.js?v=schenker-slur-s2');

let toolkit;
const backlog = [];
let toolkitStarting = false;
let toolkitStarted = false;

function handleNeonEvent(evt) {
  const data = evt.data;
  const result = { id: data.id };

  switch (data.action) {
    case 'renderData':
      result.svg = toolkit.renderData(data.mei, {});
      break;
    case 'getElementAttr':
      result.attributes = toolkit.getElementAttr(data.elementId);
      break;
    case 'edit':
      console.log('Verovio edit action', JSON.stringify(data.editorAction));
      result.result = toolkit.edit(data.editorAction);
      break;
    case 'getMEI':
      result.mei = toolkit.getMEI({
        pageNo: 0,
        scoreBased: true,
      });
      break;
    case 'editInfo':
      result.info = toolkit.editInfo();
      break;
    case 'getPageCount':
      result.pageCount = toolkit.getPageCount();
      break;
    case 'renderToSVG':
      result.svg = toolkit.renderToSVG(data.pageNo || 1);
      break;
    default:
      break;
  }
  postMessage(result);
}

function constructorWrapperIsCallable() {
  try {
    if (!verovio || !verovio.module || typeof verovio.module.cwrap !== 'function') {
      return false;
    }
    const constructorFn = verovio.module.cwrap(
      'vrvToolkit_constructor',
      'number',
      [],
    );
    return typeof constructorFn === 'function';
  } catch (e) {
    return false;
  }
}

function tryStartToolkit() {
  if (toolkitStarted || toolkitStarting) {
    return;
  }

  toolkitStarting = true;

  try {
    toolkit = new verovio.toolkit();
    toolkit.setOptions({
      inputFrom: 'mei',
      footer: 'none',
      header: 'none',
      pageMarginLeft: 0,
      pageMarginTop: 0,
      font: 'Bravura',
      useFacsimile: false,
      svgAdditionalAttribute: ['syllable@precedes', 'syllable@follows'],
      svgCss:
        'g.nc, g.custos, g.clef, g.accid, g.divLine {stroke: currentColor; stroke-width: 30px;}',
    });

    toolkitStarted = true;
    console.log('Verovio toolkit: READY');
    onmessage = handleNeonEvent;
    for (const message of backlog) {
      handleNeonEvent(message);
    }
    postMessage('ready');
  } catch (error) {
    toolkitStarting = false;
    console.warn('Verovio toolkit construction deferred', error);
  }
}

onmessage = function tempHandler(evt) {
  backlog.push(evt);
};

if (verovio && verovio.module) {
  const previousOnRuntimeInitialized = verovio.module.onRuntimeInitialized;
  verovio.module.onRuntimeInitialized = function () {
    if (typeof previousOnRuntimeInitialized === 'function') {
      previousOnRuntimeInitialized();
    }
    tryStartToolkit();
  };
}

function waitForAlreadyReady(attempt) {
  if (toolkitStarted) {
    return;
  }
  if (constructorWrapperIsCallable()) {
    tryStartToolkit();
    if (toolkitStarted) {
      return;
    }
  }
  if (attempt > 200) {
    console.error('Verovio WASM module failed to initialize');
    return;
  }
  setTimeout(() => waitForAlreadyReady(attempt + 1), 50);
}

waitForAlreadyReady(0);
