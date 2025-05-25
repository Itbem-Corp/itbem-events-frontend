import React, { useEffect, useState, useRef } from 'react';
import ReactHowler from 'react-howler';
import { Pause, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MusicWidget() {
    const [playing, setPlaying] = useState(false);
    const howlerRef = useRef(null);

    // Activar la música en la primera interacción del usuario (scroll o clic)
    useEffect(() => {
        const enableMusic = () => {
            setPlaying(true);
            window.removeEventListener('click', enableMusic);
            window.removeEventListener('scroll', enableMusic);
        };

        window.addEventListener('click', enableMusic);
        window.addEventListener('scroll', enableMusic);

        return () => {
            window.removeEventListener('click', enableMusic);
            window.removeEventListener('scroll', enableMusic);
        };
    }, []);

    const togglePlayback = () => setPlaying((prev) => !prev);

    return (
        <>
            {/* Reproductor oculto pero funcional */}
            <ReactHowler
                src="https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/events/graduaciones/izapa/Perfect+Morning+Short+Version.mp3"
                playing={playing}
                loop
                volume={0.8}
                ref={howlerRef}
            />

            {/* Botón flotante */}
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
                    {/* Animación tipo pulso */}
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

                    {/* Ícono encima del pulso */}
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
