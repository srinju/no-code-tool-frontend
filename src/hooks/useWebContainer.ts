import { useEffect, useState } from "react";
import { WebContainer } from '@webcontainer/api';

export function useWebContainer() : WebContainer | undefined {

    //hook to save the webcontainer instance

    const [webcontainer , setWebContainer] = useState<WebContainer>();

    useEffect(() => {

        const containerFunc = async() => {

            const webcontainerInstance = await WebContainer.boot();
            console.log("web contianer instance : ----------------------" , webcontainerInstance)
            setWebContainer(webcontainerInstance); //set the instance of the web container

        }

        containerFunc();
    },[]);

    return webcontainer;
}