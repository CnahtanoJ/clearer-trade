'use client';

import React, { useEffect, useRef } from 'react';

export default function InteractiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number | null = null;
    let isAnimating = false;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Mouse coordinates (default off-screen)
    const mouse = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
    };

    const startAnimation = () => {
      if (!isAnimating) {
        isAnimating = true;
        draw();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      startAnimation();
    };

    const handleMouseLeave = () => {
      mouse.targetX = -1000;
      mouse.targetY = -1000;
      startAnimation();
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      startAnimation();
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('resize', handleResize);

    const spacingX = 40; // Horizontal spacing for candlesticks
    const spacingY = 40; // Vertical spacing for candlesticks
    const proximity = 180; // Distance of mouse influence

    let time = 0;

    const draw = () => {
      time += 0.02;

      // Smoothly interpolate mouse position for fluid movement
      const dxMouse = mouse.targetX - mouse.x;
      const dyMouse = mouse.targetY - mouse.y;
      mouse.x += dxMouse * 0.12;
      mouse.y += dyMouse * 0.12;

      ctx.clearRect(0, 0, width, height);

      const isMouseOnScreen = mouse.x > 0 && mouse.y > 0;

      // 1. Draw subtle trading chart crosshair lines following the cursor
      if (isMouseOnScreen) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)'; // Lowered opacity
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;

        // Horizontal crosshair
        ctx.beginPath();
        ctx.moveTo(0, mouse.y);
        ctx.lineTo(width, mouse.y);
        ctx.stroke();

        // Vertical crosshair
        ctx.beginPath();
        ctx.moveTo(mouse.x, 0);
        ctx.lineTo(mouse.x, height);
        ctx.stroke();

        ctx.restore();
      }

      // 2. Render micro-candlestick matrix
      for (let x = spacingX / 2; x < width; x += spacingX) {
        for (let y = spacingY / 2; y < height; y += spacingY) {
          const dx = mouse.x - x;
          const dy = mouse.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          let factor = 0;
          if (dist < proximity) {
            factor = 1 - dist / proximity; // 0 to 1
          }

          // Subtle organic price fluctuation tick simulation
          const tickOffset = Math.sin(time + x * 0.05 + y * 0.05) * 1.5;

          // Candlestick geometry
          const wickHeight = 6 + factor * 8;
          const bodyHeight = 3 + factor * 5;
          const alpha = 0.02 + factor * 0.12; // Much more subtle ambient fading

          // Color tuning: muted monochrome silhouettes that glow softly
          const isBullish = (Math.floor(x + y) % 2 === 0);
          let color = `rgba(150, 150, 160, ${alpha})`;

          if (factor > 0.4) {
            if (isBullish) {
              color = `rgba(110, 180, 140, ${alpha * 0.8})`; // Muted, earthy green
            } else {
              color = `rgba(180, 110, 110, ${alpha * 0.8})`; // Muted, earthy red
            }
          }

          const candleX = x;
          const candleY = y + tickOffset;

          // Draw Wick
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.moveTo(candleX, candleY - wickHeight / 2);
          ctx.lineTo(candleX, candleY + wickHeight / 2);
          ctx.stroke();

          // Draw Body
          ctx.fillStyle = color;
          const bodyWidth = 2.5;
          ctx.fillRect(
            candleX - bodyWidth / 2,
            candleY - bodyHeight / 2,
            bodyWidth,
            bodyHeight
          );
        }
      }

      // Zero-CPU Optimization: if mouse interpolation has settled, pause requestAnimationFrame loop
      const isMoving = Math.abs(dxMouse) > 0.2 || Math.abs(dyMouse) > 0.2;
      if (isMoving || isMouseOnScreen) {
        animationFrameId = requestAnimationFrame(draw);
      } else {
        isAnimating = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
      }
    };

    startAnimation();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="hidden md:block fixed inset-0 pointer-events-none z-0 overflow-hidden transform-gpu" data-html2canvas-ignore="true">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}


