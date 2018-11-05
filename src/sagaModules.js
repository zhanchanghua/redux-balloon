import invariant from 'invariant';
import { assoc, dissoc, forEachObjIndexed } from 'ramda';
import createSagaMiddleware, * as ReduxSaga from 'redux-saga';
import * as sagaEffects from 'redux-saga/effects';
import {
  takeEveryHelper,
  takeLatestHelper,
  throttleHelper
} from 'redux-saga/lib/internal/sagaHelpers';
import {
  isPlainObject,
  isFunction,
  isArray,
  getTypeOfCancelSaga,
  noop
} from './utils';

function addSagaModule(model, existingModules) {
  const {namespace, sagas} = model;
  if (typeof sagas === 'undefined') {
    return existingModules;
  }

  invariant(
    isPlainObject(sagas) || isFunction(sagas),
    `[model.sagas] should be plain object or function, but got ${typeof sagas}`
  );

  return assoc(namespace, [sagas], existingModules);
}

function delSagaModule(namespace, existModules) {
  return dissoc(namespace, existModules);
}

function runSagaModules(modules, sagaMiddleware, runOpts, extras) {
  const {onSagaError = noop} = runOpts;
  const _extras = {...extras, ReduxSaga};
  forEachObjIndexed((module, namespace) => {
    const sagas = module[0];
    const saga = createSaga(sagas, namespace, runOpts, _extras);
    sagaMiddleware
      .run(saga)
      .done
      .catch(e => onSagaError(e, {namespace}));
  }, modules);
}

function createSaga(sagas, namespace, runOpts, extras) {
  const {fork, take, cancel} = sagaEffects;

  return function* () {
    const watcher = createWatcher(sagas, namespace, runOpts, extras);
    const task = yield fork(watcher);

    yield take(getTypeOfCancelSaga(namespace));
    yield cancel(task);
  };
}

function createWatcher(sagas, namespace, runOpts, extras) {
  if (isFunction(sagas)) {
    return sagas(sagaEffects, extras);
  } else {
    return function* () {
      const keys = Object.keys(sagas);

      for (const key of keys) {
        let type = 'takeEvery';
        let ms;
        let saga = sagas[key];

        if (isArray(saga)) {
          saga = sagas[key][0];
          const opts = sagas[key][1];
          type = opts.type;

          if (type === 'throttle') {
            ms = opts.ms;
          }
        }
        const handler = handleActionForHelper(saga, {namespace, key}, runOpts, extras);

        switch (type) {
          case 'takeLatest':
            yield takeLatestHelper(key, handler);
            break;
          case 'throttle':
            yield throttleHelper(ms, key, handler);
            break;
          default:
            yield takeEveryHelper(key, handler);
        }
      }
    };
  }
}

function handleActionForHelper(saga, {namespace, key}, runOpts, extras) {
  const {call} = sagaEffects;
  const {onSagaError = noop} = runOpts;

  return function* (action) {
    try {
      yield call(saga, action, sagaEffects, extras);
    } catch (e) {
      onSagaError(e, {namespace, key});
    }
  };
}

export {
  addSagaModule,
  delSagaModule,
  createSagaMiddleware,
  runSagaModules
};
