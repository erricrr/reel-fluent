"use client";
import type * as React from 'react';
import { Sun, Moon, LogOut, UserCircle } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


export default function Header() {
  const { user, signInWithGoogle, signOut: firebaseSignOut, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    const names = name.split(' ');
    if (names.length === 1) return names[0][0].toUpperCase();
    return names[0][0].toUpperCase() + names[names.length - 1][0].toUpperCase();
  };


  return (
    <header className="py-4 px-4 md:px-8 border-b">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
        <Image
            src={theme === 'light' ? '/logo-light.png' : '/logo-dark.png'}
            alt="ReelFluent Logo"
            width={48}
            height={48}
            className="h-12 w-12"
          />

          <h1 className="text-2xl md:text-3xl font-bold text-foreground">ReelFluent</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {loading ? (
             <Button variant="outline" disabled>Loading...</Button>
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} />
                    <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuItem className="flex flex-col items-start !pb-2 !pt-2">
                  <p className="text-sm font-medium leading-none">{user.displayName || "User"}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={firebaseSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            // Temporarily commented out - Sign In button
            // <Button variant="outline" onClick={signInWithGoogle}>
            //   <UserCircle className="mr-2 h-5 w-5" /> Sign In
            // </Button>
            <></>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
