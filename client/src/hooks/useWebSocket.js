import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const retryDelay = useRef(1000);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryDelay.current = 1000;
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      onMessageRef.current(msg);
    };

    ws.onclose = () => {
      // wsRef.current가 이미 교체됐으면 이 연결이 superseded된 것 — 재연결 안 함
      if (wsRef.current !== ws) return;
      setConnected(false);
      retryDelay.current = Math.min(retryDelay.current * 2, 16000);
      setTimeout(() => {
        if (wsRef.current === ws) connect();
      }, retryDelay.current);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      const ws = wsRef.current;
      if (ws) {
        wsRef.current = null; // 마킹: 정상 해제, 재연결 불필요
        ws.close();
      }
    };
  }, [connect]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send, connected };
}
