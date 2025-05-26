import React, { useEffect, useState, useRef } from 'react';
import ReactHowler from 'react-howler';
import { Pause, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MusicWidgetProps {
    volume?: number; // volumen entre 0 y 1
}

export default function MusicWidget({ volume = 0.8 }: MusicWidgetProps) {
    const [playing, setPlaying] = useState(false);
    const howlerRef = useRef(null);

    // Autoplay en primera interacción
    useEffect(() => {
        const enableMusic = () => {
            setPlaying(true);
            window.removeEventListener('click', enableMusic);
            window.removeEventListener('scroll', enableMusic);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                setPlaying(false); // Pausar cuando la app esté oculta
            }
        };

        window.addEventListener('click', enableMusic);
        window.addEventListener('scroll', enableMusic);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('click', enableMusic);
            window.removeEventListener('scroll', enableMusic);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const togglePlayback = () => setPlaying(prev => !prev);

    return (
        <>
            <ReactHowler
                src="https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/events/graduaciones/izapa/Perfect+Morning+Short+Version.mp3"
                playing={playing}
                loop
                volume={volume}
                ref={howlerRef}
            />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="fixed bottom-5 left-5 z-50"
            >
                <button
                    onClick={togglePlayback}
                    className="group relative w-16 h-16 bg-white/70 backdrop-blur-md border border-white/20 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                    aria-label={playing ? 'Pausar música' : 'Reproducir música'}
                >
                    <AnimatePresence>
                        {playing && (
                            <motion.div
                                className="absolute inset-0 rounded-full bg-pink-400/30 blur-md z-0"
                                initial={{ scale: 1, opacity: 0.4 }}
                                animate={{ scale: 1.5, opacity: 0 }}
                                exit={{ scale: 1, opacity: 0 }}
                                transition={{
                                    duration: 1.5,
                                    ease: 'easeInOut',
                                    repeat: Infinity,
                                }}
                            />
                        )}
                    </AnimatePresence>

                    <div className="text-black relative z-10">
                        {playing ? (
                            <Pause size={28} className="group-hover:scale-110 transition-transform" />
                        ) : (
                            <Play size={28} className="group-hover:scale-110 transition-transform" />
                        )}
                    </div>
                </button>
            </motion.div>
        </>
    );
}
