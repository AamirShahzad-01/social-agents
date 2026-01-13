
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AudioNameFormValues, audioNameSchema } from "./AudioNameSchema"
import { useEffect } from "react"

interface AudioNameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (name: string) => void;
    defaultName?: string;
    isSaving?: boolean;
}

export function AudioNameDialog({ open, onOpenChange, onSubmit, defaultName, isSaving }: AudioNameDialogProps) {
    const { register, handleSubmit, formState: { errors }, reset } = useForm<AudioNameFormValues>({
        resolver: zodResolver(audioNameSchema),
        defaultValues: {
            name: defaultName || "",
        }
    });

    useEffect(() => {
        if (open) {
            reset({ name: defaultName || "" });
        }
    }, [open, defaultName, reset]);


    const onFormSubmit = (data: AudioNameFormValues) => {
        onSubmit(data.name);
        // onOpenChange(false); // Let the parent controller close it after success
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Name Your Audio</DialogTitle>
                    <DialogDescription>
                        Give your generated audio a memorable name before saving it to the library.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onFormSubmit)}>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                Name
                            </Label>
                            <div className="col-span-3">
                                <Input
                                    id="name"
                                    className="col-span-3"
                                    {...register("name")}
                                />
                                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? "Saving..." : "Save to Library"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
