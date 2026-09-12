import { Slot, Slottable } from "@radix-ui/react-slot";
import { Spinner } from "@shared/components/Spinner";
import { cn } from "@ui/lib";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
	"flex items-center justify-center font-medium enabled:cursor-pointer transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&>svg]:mr-1.5 [&>svg]:opacity-60 [&>svg+svg]:hidden",
	{
		variants: {
			variant: {
				primary:
					"bg-primary text-primary-foreground hover:bg-primary/90",
				error: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
				outline:
					"border border-border bg-transparent text-foreground hover:bg-foreground/5",
				secondary:
					"bg-foreground/8 text-foreground hover:bg-foreground/14",
				light: "bg-foreground/5 text-foreground hover:bg-foreground/10",
				ghost: "text-foreground/70 hover:bg-foreground/8 hover:text-foreground",
				link: "text-foreground underline-offset-4 hover:underline",
			},
			size: {
				sm: "h-7 rounded-full px-3 text-xs",
				md: "h-9 rounded-full px-4 text-sm",
				lg: "h-11 rounded-full px-6 text-[0.9375rem]",
				icon: "size-9 rounded-full [&>svg]:m-0 [&>svg]:opacity-100",
			},
		},
		defaultVariants: {
			variant: "secondary",
			size: "md",
		},
	},
);

export type ButtonProps = {
	asChild?: boolean;
	loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			children,
			variant,
			size,
			asChild = false,
			loading,
			disabled,
			...props
		},
		ref
	) => {
		const Comp = asChild ? Slot : "button";
		return (
			<Comp
				className={cn(buttonVariants({ variant, size, className }))}
				disabled={disabled || loading}
				ref={ref}
				{...props}
			>
				{loading && <Spinner className="mr-1.5 size-4 text-inherit" />}
				<Slottable>{children}</Slottable>
			</Comp>
		);
	}
);

Button.displayName = "Button";

export { Button, buttonVariants };
