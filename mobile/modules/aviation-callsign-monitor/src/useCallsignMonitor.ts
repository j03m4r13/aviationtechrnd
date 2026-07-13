import { useCallback, useEffect, useRef, useState } from 'react';

import {
  addCallsignAlertListener,
  addErrorListener,
  addStatusListener,
  addTranscriptListener,
  getStatus,
  initialize,
  startMonitoring,
  stopMonitoring
} from './AviationCallsignMonitorModule';
import type {
  CallsignAlertEvent,
  CallsignErrorEvent,
  CallsignMonitorConfig,
  CallsignMonitorStatus,
  CallsignTranscriptEvent
} from './AviationCallsignMonitor.types';

const EMPTY_STATUS: CallsignMonitorStatus = {
  initialized: false,
  monitoring: false,
  callsign: '',
  whisperModel: null,
  voskModel: null
};

export function useCallsignMonitor(config: CallsignMonitorConfig) {
  const [status, setStatus] = useState<CallsignMonitorStatus>(EMPTY_STATUS);
  const [lastAlert, setLastAlert] = useState<CallsignAlertEvent | null>(null);
  const [lastTranscript, setLastTranscript] =
    useState<CallsignTranscriptEvent | null>(null);
  const [error, setError] = useState<CallsignErrorEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    const subscriptions = [
      addCallsignAlertListener(setLastAlert),
      addTranscriptListener(setLastTranscript),
      addStatusListener(setStatus),
      addErrorListener(setError)
    ];

    getStatus().then(setStatus).catch(() => undefined);
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  const prepare = useCallback(async () => {
    const key = JSON.stringify(config);
    if (initializedFor.current === key && status.initialized) {
      return status;
    }

    setBusy(true);
    setError(null);
    try {
      const next = await initialize(config);
      initializedFor.current = key;
      setStatus(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, [config, status]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await prepare();
      const next = await startMonitoring();
      setStatus(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, [prepare]);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      const next = await stopMonitoring();
      setStatus(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const clearAlert = useCallback(() => setLastAlert(null), []);

  return {
    status,
    lastAlert,
    lastTranscript,
    error,
    busy,
    prepare,
    start,
    stop,
    clearAlert
  };
}
