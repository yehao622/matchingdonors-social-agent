import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
    const baseStyle = "font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        primary: "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md",
        secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
        danger: "bg-red-500 text-white hover:bg-red-600",
        ghost: "bg-transparent text-gray-500 hover:bg-gray-100 shadow-none"
    };

    const sizes = {
        sm: "px-3 py-1.5 text-sm",
        md: "px-6 py-2.5",
        lg: "px-8 py-3 text-lg"
    };

    return (
        <button className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
            {children}
        </button>
    );
}

export default Button;