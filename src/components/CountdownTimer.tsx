"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    calculateCountdownTimeLeft,
    type TimeLeft,
} from "../lib/countdown";

interface CountdownTimerProps {
    targetDate: string | Date;
}

function AnimatedDigit({ value }: { value: number }) {
    return (
        <AnimatePresence mode="popLayout">
            <motion.span
                key={value}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="inline-block tabular-nums"
            >
                {value}
            </motion.span>
        </AnimatePresence>
    );
}

const timerStyle = {
    color: "var(--eventi-color-heading, #07293A)",
};

const digitStyle = {
    color: "var(--eventi-color-accent, #07293A)",
};

export default function CountdownTimer({ targetDate }: CountdownTimerProps) {
    const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
        calculateCountdownTimeLeft(targetDate),
    );

    useEffect(() => {
        setTimeLeft(calculateCountdownTimeLeft(targetDate));
        const timer = setInterval(() => {
            setTimeLeft(calculateCountdownTimeLeft(targetDate));
        }, 1000);

        return () => clearInterval(timer);
    }, [targetDate]);

    return (
        <div className="flex justify-center gap-4 sm:gap-8 md:gap-12 lg:gap-16" style={timerStyle}>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold" style={digitStyle}>
                    <AnimatedDigit value={timeLeft.days} />
                </div>
                <div className="text-sm font-medium font-quicksand">Días</div>
            </div>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold" style={digitStyle}>
                    <AnimatedDigit value={timeLeft.hours} />
                </div>
                <div className="text-sm font-medium font-quicksand">Horas</div>
            </div>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold" style={digitStyle}>
                    <AnimatedDigit value={timeLeft.minutes} />
                </div>
                <div className="text-sm font-medium font-quicksand">Minutos</div>
            </div>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold" style={digitStyle}>
                    <AnimatedDigit value={timeLeft.seconds} />
                </div>
                <div className="text-sm font-medium font-quicksand">Segundos</div>
            </div>
        </div>
    );
}
