"use client"

import { useState, useEffect } from "react"

interface CountdownTimerProps {
    targetDate: string | Date
}

interface TimeLeft {
    days: number
    hours: number
    minutes: number
    seconds: number
}

export default function CountdownTimer({ targetDate }: CountdownTimerProps) {
    const [timeLeft, setTimeLeft] = useState<TimeLeft>({
        days: 20,
        hours: 15,
        minutes: 45,
        seconds: 22,
    })

    useEffect(() => {
        const calculateTimeLeft = (): TimeLeft => {
            const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate
            const difference = target.getTime() - new Date().getTime()

            if (difference > 0) {
                return {
                    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                    minutes: Math.floor((difference / 1000 / 60) % 60),
                    seconds: Math.floor((difference / 1000) % 60),
                }
            }

            return {
                days: 20,
                hours: 15,
                minutes: 45,
                seconds: 22,
            }
        }

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft())
        }, 1000)

        return () => clearInterval(timer)
    }, [targetDate])

    return (
        <>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold">{timeLeft.days}</div>
                <div className="text-xs sm:text-sm">Días</div>
            </div>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold">{timeLeft.hours}</div>
                <div className="text-xs sm:text-sm">Horas</div>
            </div>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold">{timeLeft.minutes}</div>
                <div className="text-xs sm:text-sm">Minutos</div>
            </div>
            <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold">{timeLeft.seconds}</div>
                <div className="text-xs sm:text-sm">Segundos</div>
            </div>
        </>
    )
}
