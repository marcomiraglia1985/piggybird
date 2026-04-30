"use client";
import { animate, useMotionValue, useTransform, motion } from "framer-motion";
import { useEffect } from "react";

export function CountUp({
  value,
  format,
  duration = 1.2,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => (format ? format(v) : Math.round(v).toString()));

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, duration, motionValue]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
