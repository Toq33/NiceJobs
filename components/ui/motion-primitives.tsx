'use client';

import React from 'react';
import { motion, useReducedMotion, Variants } from 'framer-motion';

// Custom bespoke easing curve: ease: [0.22, 1, 0.36, 1]
export const bespokeEase = [0.22, 1, 0.36, 1] as const;

export interface MotionBaseProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}

export interface FadeUpProps extends MotionBaseProps {
  distance?: number;
  blur?: boolean;
}

/**
 * <FadeUp> Component
 * Hardware-accelerated entrance animation using transform & opacity only (optional subtle blur),
 * strictly respecting useReducedMotion and easing [0.22, 1, 0.36, 1].
 */
export const FadeUp: React.FC<FadeUpProps> = ({
  children,
  className = '',
  delay = 0,
  duration = 0.6,
  distance = 18,
  blur = false,
  ...props
}) => {
  const shouldReduceMotion = useReducedMotion();

  const initial = shouldReduceMotion
    ? { opacity: 0 }
    : {
        opacity: 0,
        y: distance,
        ...(blur ? { filter: 'blur(8px)' } : {})
      };

  const animate = shouldReduceMotion
    ? { opacity: 1 }
    : {
        opacity: 1,
        y: 0,
        ...(blur ? { filter: 'blur(0px)' } : {})
      };

  return (
    <motion.div
      initial={initial}
      whileInView={animate}
      viewport={{ once: true, margin: '-80px' }}
      transition={{
        duration,
        delay,
        ease: bespokeEase
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export interface StaggerContainerProps extends MotionBaseProps {
  staggerChildren?: number;
  delayChildren?: number;
}

/**
 * <StaggerContainer> Component
 * Coordinates child animations with a lightweight stagger sequence between 0.05s and 0.08s.
 */
export const StaggerContainer: React.FC<StaggerContainerProps> = ({
  children,
  className = '',
  staggerChildren = 0.06,
  delayChildren = 0,
  ...props
}) => {
  const shouldReduceMotion = useReducedMotion();

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : staggerChildren,
        delayChildren
      }
    }
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={containerVariants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export interface StaggerItemProps extends MotionBaseProps {
  distance?: number;
}

/**
 * <StaggerItem> Component
 * Child element designed to be placed inside <StaggerContainer>.
 */
export const StaggerItem: React.FC<StaggerItemProps> = ({
  children,
  className = '',
  distance = 16,
  duration = 0.5,
  ...props
}) => {
  const shouldReduceMotion = useReducedMotion();

  const itemVariants: Variants = {
    hidden: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: distance },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration,
        ease: bespokeEase
      }
    }
  };

  return (
    <motion.div variants={itemVariants} className={className} {...props}>
      {children}
    </motion.div>
  );
};
