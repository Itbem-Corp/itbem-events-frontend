"use client";

import { useState, useEffect } from "react";
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

export default function CountdownTimer({ targetDate }: CountdownTimerProps) {
    const calculateTimeLeft = (): TimeLeft => {
        const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;

        // 👇 Aquí aplicamos la hora actual en zona horaria deseada
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
        <div className="flex justify-center md:gap-18 sm:gap-14 gap-10 text-[#07293A]">
            <div className="text-center">
                <div className="text-3xl font-bold text-[#007BC4]">{timeLeft.days}</div>
                <div className="text-sm font-medium font-quicksand">Días</div>
            </div>
            <div className="text-center">
                <div className="text-3xl font-bold text-[#007BC4]">{timeLeft.hours}</div>
                <div className="text-sm font-medium font-quicksand">Horas</div>
            </div>
            <div className="text-center">
                <div className="text-3xl font-bold text-[#007BC4]">{timeLeft.minutes}</div>
                <div className="text-sm font-medium font-quicksand">Minutos</div>
            </div>
            <div className="text-center">
                <div className="text-3xl font-bold text-[#007BC4]">{timeLeft.seconds}</div>
                <div className="text-sm font-medium font-quicksand">Segundos</div>
            </div>
        </div>
    );
}
