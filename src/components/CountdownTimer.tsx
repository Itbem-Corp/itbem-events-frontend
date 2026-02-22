"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDateInTimeZone } from "../utils/getDateInTimeZone";

interface CountdownTimerProps {
    targetDate: string | Date;
}

interface TimeLeft {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
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

export default function CountdownTimer({ targetDate }: CountdownTimerProps) {
    const calculateTimeLeft = (): TimeLeft => {
        const target = typeof targetDate === "string" ? getDateInTimeZone("America/Mexico_City", targetDate) : targetDate;

        const now = getDateInTimeZone("America/Mexico_City");

        const difference = target.getTime() - now.getTime();

        if (difference > 0) {
            return {
                days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((difference / 1000 / 60) % 60),
                seconds: Math.floor((difference / 1000) % 60),
            };
        }

        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    };

    const [timeLeft, setTimeLeft] = useState<TimeLeft>(calculateTimeLeft);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearInterval(timer);
    }, [targetDate]);

    return (
        <div className="flex justify-center gap-8 sm:gap-12 md:gap-16 text-[#07293A]">
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-blue">
                    <AnimatedDigit value={timeLeft.days} />
                </div>
                <div className="text-sm font-medium font-quicksand">Días</div>
            </div>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-blue">
                    <AnimatedDigit value={timeLeft.hours} />
                </div>
                <div className="text-sm font-medium font-quicksand">Horas</div>
            </div>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-blue">
                    <AnimatedDigit value={timeLeft.minutes} />
                </div>
                <div className="text-sm font-medium font-quicksand">Minutos</div>
            </div>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-blue">
                    <AnimatedDigit value={timeLeft.seconds} />
                </div>
                <div className="text-sm font-medium font-quicksand">Segundos</div>
            </div>
        </div>
    );
}
