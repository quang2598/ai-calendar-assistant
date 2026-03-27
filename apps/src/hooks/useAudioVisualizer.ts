"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BAR_COUNT = 32;

type UseAudioVisualizerReturn = {
  volume: number;
  frequencies: number[];
  startVisualizer: () => Promise<void>;
  stopVisualizer: () => void;
};

const EMPTY_FREQUENCIES = new Array<number>(BAR_COUNT).fill(0);

export function useAudioVisualizer(): UseAudioVisualizerReturn {
  const [volume, setVolume] = useState(0);
  const [frequencies, setFrequencies] = useState<number[]>(EMPTY_FREQUENCIES);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const tick = useCallback(function tickFrame() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length / 255;
    setVolume(avg);

    const step = Math.floor(data.length / BAR_COUNT);
    const bars: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      let barSum = 0;
      for (let j = 0; j < step; j++) {
        barSum += data[i * step + j];
      }
      bars.push(barSum / step / 255);
    }
    setFrequencies(bars);

    rafIdRef.current = requestAnimationFrame(tickFrame);
  }, []);

  const stopVisualizer = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setVolume(0);
    setFrequencies(EMPTY_FREQUENCIES);
  }, []);

  const startVisualizer = useCallback(async () => {
    stopVisualizer();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    rafIdRef.current = requestAnimationFrame(tick);
  }, [stopVisualizer, tick]);

  useEffect(() => {
    return () => {
      stopVisualizer();
    };
  }, [stopVisualizer]);

  return { volume, frequencies, startVisualizer, stopVisualizer };
}
