'use client'

import * as Headless from '@headlessui/react'
import React, { forwardRef } from 'react'

export const Link = forwardRef(function Link(
    props: React.ComponentPropsWithoutRef<'a'>,
    ref: React.ForwardedRef<HTMLAnchorElement>
) {
    return (
        <Headless.DataInteractive>
            <a {...props} ref={ref} />
        </Headless.DataInteractive>
    )
})
