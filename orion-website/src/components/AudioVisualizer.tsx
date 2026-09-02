'use client';

import { useEffect, useRef, useState } from 'react';
import { getAnalyser, subscribe, resumeAudioContext } from '@/lib/audio-context';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Precision Instrument Audio Visualizer
 *
 * Design concept: CAD/engineering audio analyzer inspired by
 * Endfield (endfield.hypergryph.com) sci-fi industrial aesthetic.
 *
 * Layers:
 *   1. Canvas (z-0) — contour lines, CAD grid, spectrum bars, scan sweep, waves
 *   2. HUD overlay (z-1) — corner brackets, scan line, technical readouts
 *   3. Coordinate tracker (z-99998) — 2D crosshair following system cursor
 *
 * Theme-aware: spectrum colors and opacity adapt to light/dark theme.
 * System cursor is preserved; coordinate tracker augments it with CAD-style
 * horizontal/vertical guide lines and X/Y coordinate readout.
 */

export default function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [hudData, setHudData] = useState({
    freq: 0,
    amp: 0,
    peak: 0,
    active: false,
  });

  // Coordinate tracker refs — direct DOM manipulation for zero-lag
  const lineHRef = useRef<HTMLDivElement>(null);
  const lineVRef = useRef<HTMLDivElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [trackerVisible, setTrackerVisible] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* ── Sizing ────────────────────────────────────── */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    /* ── State ─────────────────────────────────────── */
    let analyser = getAnalyser();
    const smoothed = new Float32Array(128).fill(0);
    const peakHold = new Float32Array(128).fill(0);

    const unsub = subscribe(() => {
      analyser = getAnalyser();
    });

    const onClick = () => resumeAudioContext();
    window.addEventListener('click', onClick, { once: true });

    /* ── Theme colors — support both light and dark ──
       Dark mode (default):
         --primary:  oklch(0.68 0.15 190) ≈ rgb(22, 178, 197)  teal/cyan
         --chart-2:  oklch(0.62 0.13 220) ≈ rgb(47, 115, 188)  blue
       Light mode:
         --primary:  oklch(0.62 0.15 190) ≈ rgb(14, 145, 165)  darker teal
         --chart-2:  oklch(0.55 0.13 220) ≈ rgb(37, 95, 158)   darker blue
       Light mode uses 3x opacity boost for visibility on light background. */
    let opacityBoost = 1;
    function getThemeColors() {
      if (themeRef.current === 'light') {
        return {
          primary: { r: 14, g: 145, b: 165 },
          chart:   { r: 14, g: 145, b: 165 },
          accent:  { r: 37, g: 95, b: 158 },
        };
      }
      return {
        primary: { r: 22, g: 178, b: 197 },
        chart:   { r: 22, g: 178, b: 197 },
        accent:  { r: 47, g: 115, b: 188 },
      };
    }
    /** Alpha helper — applies opacity boost for light theme visibility */
    function a(alpha: number): number {
      return Math.min(alpha * opacityBoost, 1);
    }

    /* ── Coordinate tracker — follows system cursor ── */
    const onMouseMove = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      if (lineHRef.current) lineHRef.current.style.transform = `translateY(${y}px)`;
      if (lineVRef.current) lineVRef.current.style.transform = `translateX(${x}px)`;
      if (crosshairRef.current) crosshairRef.current.style.transform = `translate(${x}px, ${y}px)`;
      if (labelRef.current) labelRef.current.textContent = `X:${x}  Y:${y}`;
      if (!trackerVisible) {
        setTrackerVisible(true);
      }
    };
    const onMouseLeave = () => {
      setTrackerVisible(false);
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave);

    /* ── Helper: draw smooth bezier curve ──────────── */
    function drawSmoothCurve(points: { x: number; y: number }[]) {
      if (points.length < 2) return;
      ctx!.beginPath();
      ctx!.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const cpx = (curr.x + next.x) / 2;
        ctx!.quadraticCurveTo(curr.x, curr.y, cpx, (curr.y + next.y) / 2);
      }
      const last = points[points.length - 1];
      ctx!.quadraticCurveTo(
        last.x - (last.x - points[points.length - 2].x) / 2,
        last.y,
        last.x,
        last.y
      );
    }

    /* ── Draw CAD grid ─────────────────────────────── */
    function drawCadGrid(w: number, h: number, primary: { r: number; g: number; b: number }) {
      ctx!.save();
      const gridSize = 80;
      const subGridSize = 20;

      // Fine sub-grid
      ctx!.strokeStyle = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.015)})`;
      ctx!.lineWidth = 0.5;
      for (let x = 0; x <= w; x += subGridSize) {
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
        ctx!.stroke();
      }
      for (let y = 0; y <= h; y += subGridSize) {
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
        ctx!.stroke();
      }

      // Main grid
      ctx!.strokeStyle = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.03)})`;
      ctx!.lineWidth = 0.5;
      for (let x = 0; x <= w; x += gridSize) {
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
        ctx!.stroke();
      }
      for (let y = 0; y <= h; y += gridSize) {
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
        ctx!.stroke();
      }

      // Grid intersection marks (CAD crosshairs)
      ctx!.strokeStyle = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.04)})`;
      ctx!.lineWidth = 1;
      for (let x = 0; x <= w; x += gridSize) {
        for (let y = 0; y <= h; y += gridSize) {
          const half = 3;
          ctx!.beginPath();
          ctx!.moveTo(x - half, y);
          ctx!.lineTo(x + half, y);
          ctx!.moveTo(x, y - half);
          ctx!.lineTo(x, y + half);
          ctx!.stroke();
        }
      }
      ctx!.restore();
    }

    /* ── Draw neural network — full-screen background mesh ── */
    function drawNeuralNetwork(
      w: number,
      h: number,
      smoothed: Float32Array,
      primary: { r: number; g: number; b: number },
      accent: { r: number; g: number; b: number },
      frame: number
    ) {
      ctx!.save();

      /* Dark-theme visibility boost — neural network needs to be more
         pronounced on dark backgrounds where screen-blend dims colors.
         Light theme already gets opacityBoost=6 via the a() helper. */
      const nnVis = themeRef.current === 'light' ? 1 : 2.8;

      /* Network spread across entire screen as background texture */
      const layerCount = 7;
      const nodeCounts = [4, 6, 8, 10, 8, 6, 4];
      const networkW = w * 0.92;
      const startX = w * 0.04;
      const networkH = h * 0.82;
      const startY = h * 0.09;
      const layerSpacing = networkW / (layerCount - 1);

      /* Precompute node positions with organic offset for natural feel */
      const layers: { x: number; y: number; val: number; layer: number; idx: number }[][] = [];
      for (let l = 0; l < layerCount; l++) {
        const layerNodes: { x: number; y: number; val: number; layer: number; idx: number }[] = [];
        const count = nodeCounts[l];
        const layerX = startX + l * layerSpacing;
        for (let n = 0; n < count; n++) {
          const t = count === 1 ? 0.5 : n / (count - 1);
          const organicOffset = Math.sin(l * 1.7 + n * 0.9) * 18;
          const y = startY + t * networkH + organicOffset;
          const freqIdx = Math.floor((n / count) * 32) + l * 5;
          const val = smoothed[freqIdx % smoothed.length] || 0;
          layerNodes.push({ x: layerX, y, val, layer: l, idx: n });
        }
        layers.push(layerNodes);
      }

      /* Draw synaptic connections — subtle, mesh-like */
      for (let l = 0; l < layerCount - 1; l++) {
        const fromNodes = layers[l];
        const toNodes = layers[l + 1];
        for (const from of fromNodes) {
          for (const to of toNodes) {
            const connStrength = (from.val + to.val) * 0.5;
            const op = (0.012 + connStrength * 0.08) * nnVis;
            const isHot = connStrength > 0.4;
            const color = isHot ? accent : primary;
            ctx!.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${a(op)})`;
            ctx!.lineWidth = isHot ? 0.7 : 0.35;
            ctx!.beginPath();
            ctx!.moveTo(from.x, from.y);
            ctx!.lineTo(to.x, to.y);
            ctx!.stroke();

            /* Pulsing data packet on hot connections */
            if (isHot) {
              const pulseT = ((frame * 0.012 + from.idx * 0.2 + to.idx * 0.07) % 1);
              const px = from.x + (to.x - from.x) * pulseT;
              const py = from.y + (to.y - from.y) * pulseT;
              ctx!.fillStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${a(0.3 * nnVis)})`;
              ctx!.beginPath();
              ctx!.arc(px, py, 1.0, 0, Math.PI * 2);
              ctx!.fill();
            }
          }
        }
      }

      /* Draw nodes — subtle dots in background */
      for (let l = 0; l < layerCount; l++) {
        for (const node of layers[l]) {
          const radius = 1.2 + node.val * 3;
          const isHot = node.val > 0.4;

          /* Soft glow for active nodes */
          if (node.val > 0.12) {
            const glowR = radius + 4 + node.val * 6;
            const glowGrad = ctx!.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
            const glowColor = isHot ? accent : primary;
            glowGrad.addColorStop(0, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${a(node.val * 0.14 * nnVis)})`);
            glowGrad.addColorStop(1, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${a(0)})`);
            ctx!.fillStyle = glowGrad;
            ctx!.beginPath();
            ctx!.arc(node.x, node.y, glowR, 0, Math.PI * 2);
            ctx!.fill();
          }

          /* Node ring */
          const color = isHot ? accent : primary;
          ctx!.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${a((0.08 + node.val * 0.25) * nnVis)})`;
          ctx!.lineWidth = 0.7;
          ctx!.beginPath();
          ctx!.arc(node.x, node.y, radius, 0, Math.PI * 2);
          ctx!.stroke();

          /* Node center dot */
          if (node.val > 0.06) {
            ctx!.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${a((0.15 + node.val * 0.3) * nnVis)})`;
            ctx!.beginPath();
            ctx!.arc(node.x, node.y, radius * 0.4, 0, Math.PI * 2);
            ctx!.fill();
          }
        }
      }

      ctx!.restore();
    }

    /* ── Draw frequency spectrum bars ──────────────── */
    function drawSpectrum(
      w: number,
      h: number,
      smoothed: Float32Array,
      peakHold: Float32Array,
      primary: { r: number; g: number; b: number },
      chart: { r: number; g: number; b: number },
      frame: number
    ) {
      ctx!.save();
      const barCount = 64;
      const barWidth = w / barCount;
      const maxHeight = h * 0.12;
      const baseY = h;

      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i / barCount) * smoothed.length);
        const val = smoothed[idx] || 0;
        const barHeight = val * maxHeight;
        const x = i * barWidth;
        // Use theme colors only — chart for normal, primary for peaks
        const isPeak = val > 0.6;
        const color = isPeak ? primary : chart;
        const opacity = isPeak ? 0.18 : 0.06 + val * 0.1;

        // Bar fill
        const grad = ctx!.createLinearGradient(0, baseY - barHeight, 0, baseY);
        grad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${a(opacity)})`);
        grad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, ${a(0.01)})`);
        ctx!.fillStyle = grad;
        ctx!.fillRect(x + 1, baseY - barHeight, barWidth - 2, barHeight);

        // Bar top line
        if (barHeight > 2) {
          ctx!.strokeStyle = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(opacity * 2.5)})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(x + 1, baseY - barHeight);
          ctx!.lineTo(x + barWidth - 1, baseY - barHeight);
          ctx!.stroke();
        }

        // Peak hold marker — theme primary color
        peakHold[idx] = Math.max(peakHold[idx] * 0.98, val);
        const peakY = baseY - peakHold[idx] * maxHeight;
        if (peakHold[idx] > 0.05) {
          ctx!.strokeStyle = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.25)})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(x + 1, peakY);
          ctx!.lineTo(x + barWidth - 1, peakY);
          ctx!.stroke();
        }
      }
      ctx!.restore();
    }

    /* ── Draw scan sweep ───────────────────────────── */
    function drawScanSweep(
      w: number,
      h: number,
      primary: { r: number; g: number; b: number },
      accent: { r: number; g: number; b: number },
      frame: number
    ) {
      ctx!.save();
      const sweepPeriod = 400; // frames per full sweep
      const sweepX = ((frame % sweepPeriod) / sweepPeriod) * w;
      const sweepWidth = 80;

      // Sweep gradient
      const sweepGrad = ctx!.createLinearGradient(sweepX - sweepWidth, 0, sweepX, 0);
      sweepGrad.addColorStop(0, `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0)})`);
      sweepGrad.addColorStop(0.7, `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.015)})`);
      sweepGrad.addColorStop(1, `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.03)})`);
      ctx!.fillStyle = sweepGrad;
      ctx!.fillRect(sweepX - sweepWidth, 0, sweepWidth, h);

      // Sweep line
      ctx!.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${a(0.08)})`;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(sweepX, 0);
      ctx!.lineTo(sweepX, h);
      ctx!.stroke();

      // Tick marks on sweep line
      ctx!.strokeStyle = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.05)})`;
      ctx!.lineWidth = 0.5;
      for (let y = 0; y < h; y += 40) {
        ctx!.beginPath();
        ctx!.moveTo(sweepX - 4, y);
        ctx!.lineTo(sweepX + 4, y);
        ctx!.stroke();
      }
      ctx!.restore();
    }

    /* ── Draw dimension lines (CAD制图辅助线) ──────── */
    function drawDimensionLines(
      w: number,
      h: number,
      primary: { r: number; g: number; b: number },
      frame: number
    ) {
      ctx!.save();
      ctx!.font = '9px "Space Mono", monospace';
      ctx!.fillStyle = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.08)})`;
      ctx!.strokeStyle = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.06)})`;
      ctx!.lineWidth = 0.5;

      // Horizontal dimension at bottom
      const dimY = h - 40;
      const dims = [0.15, 0.35, 0.55, 0.75, 0.95];
      for (const ratio of dims) {
        const x = w * ratio;
        // Extension line
        ctx!.beginPath();
        ctx!.moveTo(x, dimY - 8);
        ctx!.lineTo(x, dimY + 8);
        ctx!.stroke();
        // Dimension text
        const label = `${Math.round(ratio * 1000)}`;
        ctx!.fillText(label, x - 8, dimY + 18);
      }

      // Vertical dimension on right
      const dimX = w - 30;
      const vDims = [0.2, 0.4, 0.6, 0.8];
      for (const ratio of vDims) {
        const y = h * ratio;
        ctx!.beginPath();
        ctx!.moveTo(dimX - 5, y);
        ctx!.lineTo(dimX + 5, y);
        ctx!.stroke();
        const label = `${Math.round(ratio * 100)}`;
        ctx!.fillText(label, dimX - 20, y + 3);
      }

      // Animated measurement line (marching ants)
      ctx!.setLineDash([3, 3]);
      ctx!.lineDashOffset = -frame * 0.3;
      ctx!.strokeStyle = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.04)})`;
      ctx!.beginPath();
      ctx!.moveTo(0, h * 0.5);
      ctx!.lineTo(w, h * 0.5);
      ctx!.stroke();
      ctx!.setLineDash([]);
      ctx!.restore();
    }

    /* ── Draw wave layers (retained & enhanced) ────── */
    function drawWaves(
      w: number,
      h: number,
      smoothed: Float32Array,
      primary: { r: number; g: number; b: number },
      chart: { r: number; g: number; b: number },
      accent: { r: number; g: number; b: number },
      frame: number
    ) {
      const pointCount = 48;
      const maxWaveH = h * 0.35;

      /* Layer 1: Back wave */
      const backPoints: { x: number; y: number }[] = [];
      const backOffset = Math.sin(frame * 0.008) * 15;
      for (let i = 0; i < pointCount; i++) {
        const val = smoothed[i] * 0.7;
        const x = (i / (pointCount - 1)) * w;
        const waveShape = Math.sin((i / pointCount) * Math.PI) * 0.3;
        const y = h - val * maxWaveH * (0.4 + waveShape) - backOffset - 20;
        backPoints.push({ x, y });
      }
      ctx!.save();
      ctx!.beginPath();
      drawSmoothCurve(backPoints);
      ctx!.lineTo(w, h);
      ctx!.lineTo(0, h);
      ctx!.closePath();
      const backGrad = ctx!.createLinearGradient(0, h - maxWaveH * 0.5, 0, h);
      backGrad.addColorStop(0, `rgba(${chart.r}, ${chart.g}, ${chart.b}, ${a(0)})`);
      backGrad.addColorStop(0.5, `rgba(${chart.r}, ${chart.g}, ${chart.b}, ${a(0.03)})`);
      backGrad.addColorStop(1, `rgba(${chart.r}, ${chart.g}, ${chart.b}, ${a(0.015)})`);
      ctx!.fillStyle = backGrad;
      ctx!.fill();
      ctx!.beginPath();
      drawSmoothCurve(backPoints);
      ctx!.strokeStyle = `rgba(${chart.r}, ${chart.g}, ${chart.b}, ${a(0.04)})`;
      ctx!.lineWidth = 1;
      ctx!.stroke();
      ctx!.restore();

      /* Layer 2: Main wave */
      const mainPoints: { x: number; y: number }[] = [];
      for (let i = 0; i < pointCount; i++) {
        const val = smoothed[i];
        const x = (i / (pointCount - 1)) * w;
        const waveShape = Math.sin((i / pointCount) * Math.PI) * 0.4;
        const y = h - val * maxWaveH * (0.5 + waveShape);
        mainPoints.push({ x, y });
      }
      ctx!.save();
      ctx!.beginPath();
      drawSmoothCurve(mainPoints);
      ctx!.lineTo(w, h);
      ctx!.lineTo(0, h);
      ctx!.closePath();
      const mainGrad = ctx!.createLinearGradient(0, h - maxWaveH, 0, h);
      mainGrad.addColorStop(0, `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0)})`);
      mainGrad.addColorStop(0.3, `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.05)})`);
      mainGrad.addColorStop(0.7, `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.06)})`);
      mainGrad.addColorStop(1, `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.02)})`);
      ctx!.fillStyle = mainGrad;
      ctx!.fill();
      ctx!.beginPath();
      drawSmoothCurve(mainPoints);
      ctx!.shadowColor = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.2)})`;
      ctx!.shadowBlur = 8;
      ctx!.strokeStyle = `rgba(${primary.r}, ${primary.g}, ${primary.b}, ${a(0.08)})`;
      ctx!.lineWidth = 1.5;
      ctx!.stroke();
      ctx!.shadowBlur = 0;
      ctx!.restore();

      /* Layer 3: Front highlight wave */
      const frontPoints: { x: number; y: number }[] = [];
      const frontOffset = Math.sin(frame * 0.012) * 8;
      for (let i = 0; i < pointCount; i++) {
        const val = smoothed[i] * 0.5;
        const x = (i / (pointCount - 1)) * w;
        const waveShape = Math.sin((i / pointCount) * Math.PI + 0.5) * 0.35;
        const y = h - val * maxWaveH * (0.35 + waveShape) + frontOffset + 10;
        frontPoints.push({ x, y });
      }
      ctx!.save();
      ctx!.beginPath();
      drawSmoothCurve(frontPoints);
      ctx!.lineTo(w, h);
      ctx!.lineTo(0, h);
      ctx!.closePath();
      const mixR = Math.round((primary.r + chart.r) / 2);
      const mixG = Math.round((primary.g + chart.g) / 2);
      const mixB = Math.round((primary.b + chart.b) / 2);
      const frontGrad = ctx!.createLinearGradient(0, h - maxWaveH * 0.4, 0, h);
      frontGrad.addColorStop(0, `rgba(${mixR}, ${mixG}, ${mixB}, ${a(0)})`);
      frontGrad.addColorStop(0.6, `rgba(${mixR}, ${mixG}, ${mixB}, ${a(0.02)})`);
      frontGrad.addColorStop(1, `rgba(${mixR}, ${mixG}, ${mixB}, ${a(0.008)})`);
      ctx!.fillStyle = frontGrad;
      ctx!.fill();
      ctx!.restore();

      /* Peak glow dots — theme primary color */
      ctx!.save();
      for (let i = 0; i < pointCount; i += 4) {
        const val = smoothed[i];
        if (val > 0.25) {
          const pt = mainPoints[i];
          const isPeak = val > 0.55;
          const color = isPeak ? primary : chart;
          const opacity = a(Math.min(val * (isPeak ? 0.35 : 0.25), 0.2));
          const radius = Math.max(val * (isPeak ? 7 : 5), 2);
          const dotGrad = ctx!.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
          dotGrad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`);
          dotGrad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, ${a(0)})`);
          ctx!.fillStyle = dotGrad;
          ctx!.beginPath();
          ctx!.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
          ctx!.fill();
        }
      }
      ctx!.restore();

      /* Bottom ambient glow */
      ctx!.save();
      const bottomGrad = ctx!.createLinearGradient(0, h - 60, 0, h);
      bottomGrad.addColorStop(0, 'transparent');
      bottomGrad.addColorStop(1, `rgba(${chart.r}, ${chart.g}, ${chart.b}, ${a(0.03)})`);
      ctx!.fillStyle = bottomGrad;
      ctx!.fillRect(0, h - 60, w, 60);
      ctx!.restore();
    }

    /* ── HUD data update throttle ──────────────────── */
    let hudUpdateCounter = 0;

    /* ── Draw loop ─────────────────────────────────── */
    let frame = 0;

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      frame++;

      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx!.clearRect(0, 0, w, h);

      /* Theme colors + opacity boost — adapts to light/dark theme
         Light mode uses multiply blend (CSS), so boost helps saturate colors */
      opacityBoost = themeRef.current === 'light' ? 6 : 1;
      const tc = getThemeColors();
      const primary = tc.primary;
      const chart = tc.chart;
      const accent = tc.accent;

      /* CAD grid — only in dark theme */
      if (themeRef.current !== 'light') {
        drawCadGrid(w, h, primary);
      }

      if (!analyser) {
        /* Idle state */
        drawScanSweep(w, h, primary, accent, frame);
        drawNeuralNetwork(w, h, smoothed, primary, accent, frame);
        if (themeRef.current !== 'light') {
          drawDimensionLines(w, h, primary, frame);
        }
        return;
      }

      const bufLen = analyser.frequencyBinCount;
      const freq = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(freq);

      /* Map frequency data */
      const pointCount = 48;
      const step = Math.floor(bufLen / pointCount);

      let maxVal = 0;
      let avgVal = 0;
      for (let i = 0; i < pointCount; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += freq[i * step + j];
        }
        const raw = sum / step / 255;
        smoothed[i] += (raw - smoothed[i]) * 0.12;
        if (smoothed[i] > maxVal) maxVal = smoothed[i];
        avgVal += smoothed[i];
      }
      avgVal /= pointCount;

      /* Draw layers — neural network + scan + dimensions */
      drawScanSweep(w, h, primary, accent, frame);
      drawNeuralNetwork(w, h, smoothed, primary, accent, frame);
      if (themeRef.current !== 'light') {
        drawDimensionLines(w, h, primary, frame);
      }

      /* Update HUD data every ~6 frames (10fps) */
      hudUpdateCounter++;
      if (hudUpdateCounter >= 6) {
        hudUpdateCounter = 0;
        setHudData({
          freq: Math.round(maxVal * 20000),
          amp: Math.round(avgVal * 100),
          peak: Math.round(maxVal * 100),
          active: maxVal > 0.01,
        });
      }
    }

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', onClick);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      unsub();
    };
  }, []);

  return (
    <>
      {/* ═══ Canvas layer — audio reactive visualization (below page content) ═══ */}
      <canvas
        ref={canvasRef}
        className="visualizer-canvas pointer-events-none fixed inset-0"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      />

      {/* ═══ HUD overlay layer — technical instrument frame ═══ */}
      <div
        className="visualizer-hud pointer-events-none fixed inset-0 opacity-40"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        {/* Corner brackets — CAD/HUD style */}
        <div className="hud-corner hud-corner-tl" />
        <div className="hud-corner hud-corner-tr" />
        <div className="hud-corner hud-corner-bl" />
        <div className="hud-corner hud-corner-br" />

        {/* Scan line — vertical sweep */}
        <div className="hud-scanline" />

        {/* Top-left: Status readout */}
        <div className="hud-readout hud-readout-tl">
          <div className="hud-readout-row">
            <span className="hud-readout-label">SYS</span>
            <span className={`hud-readout-value ${hudData.active ? 'hud-readout-active' : ''}`}>
              {hudData.active ? '● ACTIVE' : '○ STANDBY'}
            </span>
          </div>
          <div className="hud-readout-row">
            <span className="hud-readout-label">FREQ</span>
            <span className="hud-readout-value">{hudData.freq.toLocaleString()} Hz</span>
          </div>
          <div className="hud-readout-row">
            <span className="hud-readout-label">AMP</span>
            <span className="hud-readout-value">{hudData.amp}%</span>
          </div>
        </div>

        {/* Top-right: Peak indicator */}
        <div className="hud-readout hud-readout-tr">
          <div className="hud-readout-row">
            <span className="hud-readout-label">PEAK</span>
            <span className={`hud-readout-value ${hudData.peak > 60 ? 'hud-readout-peak' : ''}`}>
              {hudData.peak}%
            </span>
          </div>
          <div className="hud-readout-row">
            <span className="hud-readout-label">MODE</span>
            <span className="hud-readout-value">SPECTRUM</span>
          </div>
        </div>

        {/* Bottom-right: Technical label */}
        <div className="hud-readout hud-readout-br">
          <div className="hud-readout-row">
            <span className="hud-readout-label">ORION</span>
            <span className="hud-readout-value">AUDIO·VIZ</span>
          </div>
          <div className="hud-readout-row">
            <span className="hud-readout-label">VER</span>
            <span className="hud-readout-value">2.0·CAD</span>
          </div>
        </div>

        {/* Edge tick marks — CAD measurement style */}
        <div className="hud-ticks hud-ticks-top" />
        <div className="hud-ticks hud-ticks-bottom" />
        <div className="hud-ticks hud-ticks-left" />
        <div className="hud-ticks hud-ticks-right" />
      </div>

      {/* ═══ 2D Coordinate tracker — follows system cursor ═══ */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: 99998, opacity: trackerVisible ? 1 : 0, transition: 'opacity 0.2s ease' }}
        aria-hidden="true"
      >
        {/* Horizontal guide line at cursor Y */}
        <div ref={lineHRef} className="coord-line-h" />
        {/* Vertical guide line at cursor X */}
        <div ref={lineVRef} className="coord-line-v" />
        {/* Crosshair circle + dot at cursor position */}
        <div ref={crosshairRef} className="coord-crosshair">
          <div className="coord-crosshair-ring" />
          <div className="coord-crosshair-dot" />
          {/* Coordinate label */}
          <span ref={labelRef} className="coord-label">X:0  Y:0</span>
        </div>
      </div>
    </>
  );
}
