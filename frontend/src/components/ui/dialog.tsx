import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

// Dialog Root
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  modal?: boolean;
}

const Dialog = ({
  open,
  onOpenChange,
  children,
  modal = true,
}: DialogProps) => {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      {children}
    </BaseDialog.Root>
  );
};

// Dialog Trigger
interface DialogTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

const DialogTrigger = ({ children, asChild }: DialogTriggerProps) => {
  return (
    <BaseDialog.Trigger {...({ asChild } as any)}>
      {children}
    </BaseDialog.Trigger>
  );
};

// Dialog Backdrop
interface DialogBackdropProps {
  className?: string;
}

const DialogBackdrop = React.forwardRef<HTMLDivElement, DialogBackdropProps>(
  ({ className }, ref) => {
    return (
      <BaseDialog.Backdrop
        ref={ref}
        className={cn(
          "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
      />
    );
  },
);

DialogBackdrop.displayName = "DialogBackdrop";

// Dialog Content
interface DialogContentProps {
  className?: string;
  children: React.ReactNode;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children }, ref) => {
    return (
      <BaseDialog.Portal>
        <DialogBackdrop />
        <BaseDialog.Popup
          ref={ref}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
            "w-full max-w-lg max-h-[85vh] overflow-hidden",
            "bg-white rounded-lg shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
            className,
          )}
        >
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    );
  },
);

DialogContent.displayName = "DialogContent";

// Dialog Title
interface DialogTitleProps {
  className?: string;
  children: React.ReactNode;
}

const DialogTitle = React.forwardRef<HTMLHeadingElement, DialogTitleProps>(
  ({ className, children }, ref) => {
    return (
      <BaseDialog.Title
        ref={ref}
        className={cn(
          "text-lg font-semibold leading-none tracking-tight text-gray-900",
          className,
        )}
      >
        {children}
      </BaseDialog.Title>
    );
  },
);

DialogTitle.displayName = "DialogTitle";

// Dialog Description
interface DialogDescriptionProps {
  className?: string;
  children: React.ReactNode;
}

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  DialogDescriptionProps
>(({ className, children }, ref) => {
  return (
    <BaseDialog.Description
      ref={ref}
      className={cn("text-sm text-gray-500", className)}
    >
      {children}
    </BaseDialog.Description>
  );
});

DialogDescription.displayName = "DialogDescription";

// Dialog Close
interface DialogCloseProps {
  className?: string;
  children?: React.ReactNode;
  asChild?: boolean;
}

const DialogClose = React.forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ className, children, asChild }, ref) => {
    return (
      <BaseDialog.Close
        ref={ref}
        {...({ asChild } as any)}
        className={cn(
          !asChild &&
            "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:pointer-events-none",
          className,
        )}
      >
        {children || (
          <span className="h-4 w-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
            <span className="sr-only">Close</span>
          </span>
        )}
      </BaseDialog.Close>
    );
  },
);

DialogClose.displayName = "DialogClose";

export {
  Dialog,
  DialogTrigger,
  DialogBackdrop,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
