'use client';

import { restaurantLogoMimeSchema, restaurantLogoResponseSchema } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import RestaurantLogo from '@/components/RestaurantLogo';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import usePermissions from '@/hooks/auth/usePermissions';
import {
  useRestaurantLogo,
  useUpdateRestaurantLogo,
} from '@/services/api/requests/restaurant-settings';

export default function LogoSettings(): ReactElement {
  const { can } = usePermissions();
  const logo = useRestaurantLogo();
  const { mutateAsync: save, isPending } = useUpdateRestaurantLogo();
  const form = useForm<{ file: FileList }>();

  const upload = form.handleSubmit(({ file }) => {
    const selected = file?.[0];
    const mimeType = restaurantLogoMimeSchema.safeParse(selected?.type);
    if (!selected || !mimeType.success || selected.size > 512_000) {
      form.setError('file', { message: 'Choose a PNG, JPEG or WebP image under 512 KB.' });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () =>
      form.setError('file', { message: 'The selected image could not be read.' });
    reader.onload = () => {
      const data = String(reader.result).split(',')[1];
      const payload = restaurantLogoResponseSchema.safeParse({
        logo: { data, mimeType: mimeType.data },
      });
      if (!payload.success) {
        form.setError('file', { message: 'The selected image could not be read.' });
        return;
      }
      void save(payload.data).then(
        () => form.reset(),
        () => undefined,
      );
    };
    reader.readAsDataURL(selected);
  });

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5" aria-label="Restaurant logo">
      <h2 className="font-semibold">Restaurant logo</h2>
      <RestaurantLogo className="size-16 rounded-md border object-contain" />
      {can(Permission.RESTAURANT_WRITE) && (
        <form onSubmit={upload} className="space-y-3">
          <label className="block text-sm" htmlFor="restaurant-logo">
            Choose a logo
          </label>
          <Input
            id="restaurant-logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            {...form.register('file')}
            disabled={isPending}
          />
          <FieldError>{form.formState.errors.file?.message}</FieldError>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              Upload logo
            </Button>
            {logo.data?.logo && (
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  void save({ logo: null }).catch(() => undefined);
                }}
              >
                Remove logo
              </Button>
            )}
          </div>
        </form>
      )}
      {logo.isError && (
        <p role="alert" className="text-sm">
          Unable to load the restaurant logo.
        </p>
      )}
    </section>
  );
}
