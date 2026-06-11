'use client';

import { useEffect } from 'react';

import { initAmplitude } from '../lib/amplitude';

export function AmplitudeInitializer() {
  useEffect(() => {
    void initAmplitude();
  }, []);

  return null;
}
