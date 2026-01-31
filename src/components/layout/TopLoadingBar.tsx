'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

export default function TopLoadingBar() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        setLoading(true)
        const timeout = setTimeout(() => {
            setLoading(false)
        }, 500) // Simulate a short loading state for visual feedback

        return () => clearTimeout(timeout)
    }, [pathname, searchParams])

    return (
        <AnimatePresence>
            {loading && (
                <motion.div
                    initial={{ scaleX: 0, opacity: 1, originX: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                    className="fixed top-0 left-0 right-0 h-1 bg-primary z-[9999]"
                />
            )}
        </AnimatePresence>
    )
}
