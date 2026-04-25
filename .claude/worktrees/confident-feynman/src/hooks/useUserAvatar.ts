import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';

/** Returns the current user's avatar URL (profiles table > user_metadata > Google photo). */
export function useUserAvatar(): string | null {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check profiles table first (persists across login/logout)
        try {
          const { data } = await supabase
            .from('profiles')
            .select('avatar_url')
            .eq('id', user.id)
            .single();
          if (data?.avatar_url) {
            setAvatarUrl(data.avatar_url);
            return;
          }
        } catch {
          // profiles table may not have a row yet
        }

        // Fallback to user_metadata
        const url =
          user.user_metadata?.avatar_url ??
          user.user_metadata?.picture ??
          null;
        setAvatarUrl(url);
      })();
    }, [])
  );

  return avatarUrl;
}
