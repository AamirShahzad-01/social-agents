import React from 'react';

export const LoadingSkeleton: React.FC = () => {
    return (
        <div className="flex h-full bg-[#f9f9f8]">
            <div className="flex-1 flex flex-col h-full">
                {/* Main content area with skeleton */}
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-full max-w-3xl px-6 animate-pulse">
                        {/* Logo skeleton */}
                        <div className="flex justify-center mb-8">
                            <div className="w-16 h-16 bg-gray-200 rounded-full"></div>
                        </div>

                        {/* Title skeleton */}
                        <div className="text-center mb-8">
                            <div className="h-8 bg-gray-200 rounded-lg w-2/3 mx-auto mb-3"></div>
                            <div className="h-4 bg-gray-200 rounded-lg w-1/2 mx-auto"></div>
                        </div>

                        {/* Suggestion cards skeleton */}
                        <div className="grid grid-cols-2 gap-3 mb-8">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-20 bg-white rounded-xl border border-gray-200"></div>
                            ))}
                        </div>

                        {/* Input field skeleton */}
                        <div className="relative">
                            <div className="h-14 bg-white rounded-[20px] border border-gray-200"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
