import { useState } from 'react';

export default function DrinkForm() {
    const [bebida, setBebida] = useState<string>('');
    const [mensaje, setMensaje] = useState<string>('');

    const registrar = async () => {
        try {
            const res = await fetch('/api/drink', {
                method: 'POST',
                body: JSON.stringify({ bebida }),
                headers: { 'Content-Type': 'application/json' },
            });

            const data: { message: string } = await res.json();
            setMensaje(data.message || '¡Registrado!');
            setBebida('');
        } catch (err) {
            console.error('Error al registrar bebida:', err);
            setMensaje('Error al registrar.');
        }
    };

    return (
        <div>
            <input
                value={bebida}
                onChange={(e) => setBebida(e.target.value)}
                placeholder="Ej: espresso, latte, capuccino"
            />
            <button onClick={registrar}>Registrar bebida</button>
            {mensaje && <p>{mensaje}</p>}
        </div>
    );
}
