
"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  s: number;
  v: number;
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    const desiredCount = () =>
      Math.floor((window.innerWidth * window.innerHeight) / 6000);

    const makeStars = (count: number): Star[] => {
      return Array.from({ length: count }, () => ({
        x: Math.random(),
        y: Math.random(),
        z: Math.random(),
        s: 0.4 + Math.random() * 1.5,
        v: 0.14 + Math.random() * 0.6,
      }));
    };

    let stars = makeStars(desiredCount());

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "white";

      for (const star of stars) {
        star.z -= star.v * 0.002;

        if (star.z <= 0) {
          star.z = 1;
          star.x = Math.random();
          star.y = Math.random();
        }

        const x = star.x * canvas.width;
        const y = star.y * canvas.height;
        const size = star.s * (1 - star.z);

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
      <div className="relative z-10 flex items-center justify-center h-full text-white text-4xl font-bold">
        Galactic Marines
      </div>
    </main>
  );
}
