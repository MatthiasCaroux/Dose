import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function BarcodeScanner({ onDetected }) {
  const [status, setStatus] = useState('init') // init | scanning | error
  const [errorMsg, setErrorMsg] = useState('')
  const onDetectedRef = useRef(onDetected)
  const scannerRef = useRef(null)
  const activeRef = useRef(true)

  // Keep ref current without restarting the scanner
  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    activeRef.current = true
    const scanner = new Html5Qrcode('qr-reader-container')
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 180 },
          aspectRatio: 1.333,
          formatsToSupport: [
            0,  // QR_CODE
            4,  // EAN_13 (main grocery barcode)
            5,  // EAN_8
            6,  // CODE_39
            8,  // CODE_128
            11, // UPC_A
            12, // UPC_E
          ],
        },
        (code) => {
          if (activeRef.current) {
            activeRef.current = false
            onDetectedRef.current(code)
          }
        },
        () => {} // per-frame errors are normal, ignore
      )
      .then(() => {
        if (activeRef.current) setStatus('scanning')
      })
      .catch((err) => {
        if (activeRef.current) {
          setStatus('error')
          setErrorMsg(
            err?.message?.includes('permission')
              ? "Accès à la caméra refusé. Autorisez l'accès dans les paramètres de votre navigateur."
              : "Impossible d'accéder à la caméra."
          )
        }
      })

    return () => {
      activeRef.current = false
      if (scanner.isScanning) {
        scanner.stop().catch(() => {})
      }
    }
  }, []) // run exactly once

  if (status === 'error') {
    return (
      <div className="scanner-error">
        <p style={{ fontSize: '2rem', marginBottom: 12 }}>⊘</p>
        <p>{errorMsg}</p>
      </div>
    )
  }

  return (
    <div className="scanner-wrap">
      {status === 'init' && (
        <p className="scanner-hint">Initialisation de la caméra…</p>
      )}
      {status === 'scanning' && (
        <p className="scanner-hint">Pointez vers un code-barres</p>
      )}
      {/* html5-qrcode renders its video/canvas inside this element */}
      <div id="qr-reader-container" className="qr-container" />
    </div>
  )
}
